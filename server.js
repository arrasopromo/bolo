console.log('🚀 Starting server...');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Email Transporter Configuration (Gmail)
// Ensure EMAIL_USER and EMAIL_PASS are set in .env
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || process.env.SMTP_USER,
        pass: process.env.EMAIL_PASS || process.env.SMTP_PASS
    }
});

// Helper: Capitalize First Letter
const capitalizeFirstLetter = (string) => {
    if (!string) return string;
    return string.charAt(0).toUpperCase() + string.slice(1);
};

// Polyfill for global File object (Required for OpenAI SDK in Node < 20)
try {
    const { File } = require('node:buffer');
    if (!globalThis.File) {
        globalThis.File = File;
    }
} catch (e) {
    console.warn('Could not polyfill global.File, OpenAI uploads might fail on older Node versions:', e);
}

const app = express();
const PORT = process.env.PORT || 4000;

// Configure Multer for audio uploads
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Models
const User = require('./models/User');
const Product = require('./models/Product');
const Ingredient = require('./models/Ingredient');
const Sale = require('./models/Sale');
const FixedCost = require('./models/FixedCost');
const VariableCost = require('./models/VariableCost'); // If needed
const FinancialStrategy = require('./models/FinancialStrategy');
const OpenAIUsage = require('./models/OpenAIUsage');

function computeUsageMap(product, saleQty) {
    const y = product && product.yield && product.yield > 0 ? product.yield : 1;
    const factor = product && product.yieldActive ? (saleQty / y) : saleQty;
    const map = new Map();
    if (product && Array.isArray(product.ingredients)) {
        for (const it of product.ingredients) {
            const id = it && it.ingredient ? String(it.ingredient) : '';
            const used = (it && it.quantityUsed ? it.quantityUsed : 0) * factor;
            if (!id) continue;
            map.set(id, (map.get(id) || 0) + used);
        }
    }
    return map;
}

// OpenAI Config
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    
    // DEBUG LOG for 401 Loop Diagnosis
    // console.log(`[AuthMiddleware] URL: ${req.url}, Method: ${req.method}, TokenCookie: ${!!req.cookies.token}, TokenHeader: ${!!req.headers['authorization']}`);

    if (!token) {
        // If it's a page request, redirect to login
        if (req.accepts('html') && req.method === 'GET') {
             return res.redirect('/membros');
        }
        console.warn(`[AuthMiddleware] 401 Unauthorized - No token provided. URL: ${req.url}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            if (req.accepts('html') && req.method === 'GET') {
                 return res.redirect('/membros');
            }
            console.error(`[AuthMiddleware] 403 Forbidden - Verification Failed: ${err.message}`);
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.user = user;
        next();
    });
};

// Middleware: Check Subscription Status
const checkSubscription = async (req, res, next) => {
    try {
        // req.user is set by authenticateToken (contains _id)
        if (!req.user || !req.user._id) return res.status(401).json({ error: 'Unauthorized' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const now = new Date();
        
        // Plano BASIC ou TEST: acesso ilimitado (sem expiração ou bloqueio)
        // Also bypass if request comes from Basic Mode interface
        if (user.plan === 'basic' || user.plan === 'test' || req.query.basic === '1' || req.headers['x-basic-mode'] === '1') {
            return next();
        }

        // DEBUG LOG
        // console.log(`[CheckSub] User: ${user.email}, Status: ${user.subscriptionStatus}, Method: ${req.method}, Exp: ${user.subscriptionExpiresAt}`);

        // Check Expiration for ALL users who have a subscription date
        if (user.subscriptionExpiresAt) {
            // Check if expired
            if (now > new Date(user.subscriptionExpiresAt)) {
                console.log(`[CheckSub] User ${user.email} is expired (Date Check). Method: ${req.method}`);
                // Auto-update status if needed
                if (user.subscriptionStatus !== 'expired') {
                    user.subscriptionStatus = 'expired';
                    await user.save();
                }
                
                // Allow GET requests (read-only) for expired users so they can see data behind the modal
                if (req.method !== 'GET') {
                    return res.status(403).json({ 
                        error: 'Sua assinatura expirou.', 
                        code: 'SUBSCRIPTION_EXPIRED',
                        expiredAt: user.subscriptionExpiresAt 
                    });
                }
            }
        }
        
        // Check Status
        if (user.subscriptionStatus === 'expired') {
             // Allow GET requests (read-only)
             if (req.method !== 'GET') {
                 return res.status(403).json({ 
                    error: 'Sua assinatura expirou.', 
                    code: 'SUBSCRIPTION_EXPIRED',
                    expiredAt: user.subscriptionExpiresAt 
                });
            }
        }
        
        // Optional: Block 'inactive' users if necessary
        // if (user.subscriptionStatus === 'inactive') { ... }
        
        next();
    } catch (err) {
        console.error('Subscription check error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- Routes ---

// Serve HTML Views
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/fluxo', (req, res) => res.sendFile(path.join(__dirname, 'views', 'fluxo.html')));
app.get('/precificacao', (req, res) => res.sendFile(path.join(__dirname, 'views', 'precificacao.html')));
app.get('/membros', (req, res) => res.sendFile(path.join(__dirname, 'views', 'membros.html')));
app.get('/equilibrio', (req, res) => res.sendFile(path.join(__dirname, 'views', 'equilibrio.html')));
app.get('/apresentacao', (req, res) => res.sendFile(path.join(__dirname, 'views', 'apresentacao.html')));
app.get('/aulas', (req, res) => res.sendFile(path.join(__dirname, 'views', 'aulas.html')));
app.get('/novidade', (req, res) => res.sendFile(path.join(__dirname, 'views', 'novidade.html')));
app.get('/projeto', (req, res) => res.sendFile(path.join(__dirname, 'views', 'projeto.html')));
app.get('/quiz', (req, res) => res.sendFile(path.join(__dirname, 'views', 'quiz.html')));

const getOrCreateTestUserToken = async (req, res) => {
    try {
        let tokenToUse = req.cookies.token;
        let userToUse = null;

        if (tokenToUse) {
            try {
                const decoded = jwt.verify(tokenToUse, process.env.JWT_SECRET);
                userToUse = decoded;
            } catch (e) {
                tokenToUse = null; // Invalid token
            }
        }

        if (!tokenToUse) {
            // Create Guest User
            const guestId = Math.random().toString(36).substring(7);
            const email = `guest_${Date.now()}_${guestId}@teste.bellecake`;
            const password = await bcrypt.hash('guest123', 10);
            
            const user = new User({
                name: 'Visitante',
                email: email,
                password: password,
                plan: 'test'
            });
            await user.save();

            // Generate Token
            tokenToUse = jwt.sign(
                { _id: user._id, name: user.name, plan: 'test' }, 
                process.env.JWT_SECRET
            );

            // Set Cookie
            res.cookie('token', tokenToUse, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
        }
        return tokenToUse;
    } catch (err) {
        console.error('Error creating guest user:', err);
        throw err;
    }
};

const handleTestTools = async (req, res) => {
    try {
        const tokenToUse = await getOrCreateTestUserToken(req, res);

        // Serve File with Token Injection
        const filePath = path.join(__dirname, 'views', 'ferramentas.html');
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading view:', err);
                return res.status(500).send('Erro ao carregar ferramenta.');
            }
            // Inject token for localStorage backup
            const injected = data.replace('</head>', `<script>window.SERVER_TOKEN = "${tokenToUse}"; localStorage.setItem('bellecake_token', "${tokenToUse}");</script></head>`);
            res.send(injected);
        });

    } catch (err) {
        console.error('Error handling test tools:', err);
        res.status(500).send('Erro ao iniciar modo de teste.');
    }
};

const handleQuizTestIngredientes = async (req, res) => {
    try {
        const token = await getOrCreateTestUserToken(req, res);
        const tab = req.query.tab || 'ingredientes';
        const t = req.query.t || Date.now(); // Ensure timestamp is passed or generated
        // Append token to URL so precificacao.html can pick it up via script
        res.redirect(`/precificacao?embed=1&tab=${tab}&mode=test&token=${token}&t=${t}`);
    } catch (err) {
        console.error('Error handling quiz test ingredients:', err);
        res.status(500).send('Erro ao iniciar modo de teste.');
    }
};

app.get('/ferramenta-teste', handleTestTools);
app.get('/ferramentas-teste', handleTestTools);
app.get('/quiz-test-ingredientes', handleQuizTestIngredientes);

app.get('/upgrade', (req, res) => res.sendFile(path.join(__dirname, 'views', 'upgrade.html')));
app.get('/ferramentas', authenticateToken, (req, res) => {
    // Block Guest/Test users from the main tools area
    if (req.user.plan === 'test') {
        return res.status(403).send(`
            <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #FFFBF7; color: #32221D;">
                <h1>Acesso Restrito</h1>
                <p>O acesso como Visitante é permitido apenas na página de teste.</p>
                <a href="/ferramentas-teste" style="color: #CD7A3E; font-weight: bold; text-decoration: none; margin-bottom: 20px; display: block;">Ir para Ferramentas Teste</a>
                <a href="/membros" style="color: #32221D; text-decoration: underline;">Fazer Login como Membro</a>
            </body>
        `);
    }
    res.sendFile(path.join(__dirname, 'views', 'ferramentas.html'));
});
app.get('/ferramentas-basic', (req, res) => res.sendFile(path.join(__dirname, 'views', 'ferramentas.html')));

// Redirects for direct access
app.get('/ingredientes', (req, res) => res.redirect('/precificacao?tab=ingredientes'));
app.get('/produtos', (req, res) => res.redirect('/precificacao?tab=produtos'));
app.get('/estoque', (req, res) => res.sendFile(path.join(__dirname, 'views', 'estoque.html')));

// app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html'))); // Use modal instead

// API: Auth
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login-email', async (req, res) => {
    try {
        const { email } = req.body;
        console.log(`🔑 Login attempt for email: ${email}`); // DEBUG LOG
        
        // Find user by email (case insensitive)
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        
        if (!user) {
            console.warn(`⚠️ User not found: ${email}`);
            return res.status(404).json({ error: 'E-mail não encontrado.' });
        }

        // Generate Token (No Expiration as requested)
        // Note: Using a very long expiration time is better than no expiration for some libs, 
        // but jwt.sign with no 'expiresIn' creates a token that doesn't expire.
        // However, to be safe and explicit, let's use a very long time (e.g., 10 years).
        const token = jwt.sign(
            { _id: user._id, name: user.name }, 
            process.env.JWT_SECRET
            // No expiresIn means it defaults to "forever" (or depends on library version), 
            // but explicitly omitting it makes it not expire based on time.
        );
        
        // Cookie (10 years)
        res.cookie('token', token, { httpOnly: true, maxAge: 10 * 365 * 24 * 60 * 60 * 1000 }); 
        
        console.log(`✅ Login successful for: ${user.name}`);
        res.json({ token, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ _id: user._id, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days
        res.json({ token, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Products
app.get('/api/products', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const products = await Product.find({ user: req.user._id });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', authenticateToken, checkSubscription, async (req, res) => {
    try {
        if (req.user.plan === 'test') {
            const count = await Product.countDocuments({ user: req.user._id });
            if (count >= 2) {
                return res.status(403).json({ error: 'Limite de 2 produtos atingido no modo teste.' });
            }
        }
        const { name, salePrice, variableCost, ingredients, yield: yieldAmount, yieldActive, markup, platformFee, platformFeeActive, invisibleCost } = req.body;
        const product = new Product({
            name: capitalizeFirstLetter(name),
            salePrice,
            variableCost,
            ingredients: ingredients || [],
            yield: yieldAmount || 1,
            yieldActive: !!yieldActive,
            markup: markup || 0,
            platformFee: platformFee || 0,
            platformFeeActive: !!platformFeeActive,
            invisibleCost: invisibleCost || 0,
            user: req.user._id
        });
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { name, salePrice, variableCost, ingredients, yield: yieldAmount, yieldActive, markup, platformFee, platformFeeActive, invisibleCost } = req.body;
        console.log(`📝 Update Product ${req.params.id} - InvCost: ${invisibleCost}, Markup: ${markup}`);
        
        const updateData = { 
            name: capitalizeFirstLetter(name), 
            salePrice, 
            variableCost,
            yieldActive: !!yieldActive,
            markup: markup || 0,
            platformFee: platformFee || 0,
            platformFeeActive: !!platformFeeActive,
            invisibleCost: invisibleCost || 0
        };
        if (ingredients !== undefined) updateData.ingredients = ingredients;
        if (yieldAmount !== undefined) updateData.yield = yieldAmount;

        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            updateData,
            { new: true }
        );
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Ingredients
app.get('/api/ingredients', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const ingredients = await Ingredient.find({ user: req.user._id });
        res.json(ingredients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ingredients', authenticateToken, checkSubscription, async (req, res) => {
    try {
        if (req.user.plan === 'test') {
            const count = await Ingredient.countDocuments({ user: req.user._id });
            if (count >= 10) {
                return res.status(403).json({ error: 'Limite de 10 ingredientes atingido no modo teste.' });
            }
        }
        const { name, price, unit, quantityPackage, currentStock } = req.body;
        
        // Server-side duplicate check (case-insensitive)
        const existing = await Ingredient.findOne({ 
            user: req.user._id,
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        });

        if (existing) {
            return res.status(400).json({ error: 'Ingrediente já cadastrado.' });
        }

        const ingredient = new Ingredient({
            name: capitalizeFirstLetter(name),
            price,
            unit,
            quantityPackage,
            currentStock: currentStock || 0,
            user: req.user._id
        });
        await ingredient.save();
        res.status(201).json(ingredient);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Ingrediente já cadastrado.' });
        }
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/ingredients/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { name, price, unit, quantityPackage, currentStock } = req.body;
        
        const updateData = {};
        if (name) updateData.name = capitalizeFirstLetter(name);
        if (price !== undefined) updateData.price = price;
        if (unit) updateData.unit = unit;
        if (quantityPackage !== undefined) updateData.quantityPackage = quantityPackage;
        if (currentStock !== undefined) updateData.currentStock = currentStock;

        const ingredient = await Ingredient.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            updateData,
            { new: true }
        );
        if (!ingredient) return res.status(404).json({ error: 'Ingredient not found' });
        res.json(ingredient);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/ingredients/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const ingredient = await Ingredient.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!ingredient) return res.status(404).json({ error: 'Ingredient not found' });
        res.json({ message: 'Ingredient deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Sales
app.get('/api/sales', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { limit, startDate, endDate, productId } = req.query;
        console.log(`👤 Fetching sales for user: ${req.user.name} (${req.user._id})`); // DEBUG LOG
        
        let filter = { user: req.user._id };

        // Date Filter
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Only force full day if input looks like YYYY-MM-DD (length 10)
            if (startDate.length === 10) start.setUTCHours(0, 0, 0, 0);
            if (endDate.length === 10) end.setUTCHours(23, 59, 59, 999);
            
            filter.date = { $gte: start, $lte: end };
        }

        // Product Filter
        if (productId && productId !== 'all') {
            filter.product = productId;
        }

        let query = Sale.find(filter).populate('product').sort({ date: -1 });
        if (limit) query = query.limit(parseInt(limit));
        
        const sales = await query;
        console.log(`📦 Found ${sales.length} sales`); // DEBUG LOG
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sales', authenticateToken, checkSubscription, async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            console.error('❌ User not authenticated or missing ID');
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        if (req.user.plan === 'test') {
            const count = await Sale.countDocuments({ user: req.user._id });
            if (count >= 5) {
                return res.status(403).json({ error: 'Limite de 5 vendas atingido no modo teste.' });
            }
        }

        console.log('📥 Received POST /api/sales body:', req.body);
        const { productId, quantity, date, paymentMethod, platformFee = 0, deliveryFee = 0, notes, ignoreStockWarnings } = req.body;

        // Helpers for date/time and formatting
        const buildSaoPauloDate = (dateStr) => {
            try {
                const now = new Date();
                const timeStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
                const [hh, mm, ss] = timeStr.split(':').map(v => parseInt(v, 10));
                const [y, m, d] = dateStr.split('-').map(v => parseInt(v, 10));
                // Brazil (São Paulo) currently uses UTC-3 without DST
                const offsetHours = 3;
                const dtUtc = new Date(Date.UTC(y, m - 1, d, hh + offsetHours, mm, ss));
                return dtUtc;
            } catch (e) {
                return new Date(dateStr + 'T12:00:00-03:00');
            }
        };
        const formatQty = (num) => {
            const rounded = Number((num || 0).toFixed(3));
            return Math.abs(rounded - Math.trunc(rounded)) < 1e-9 ? String(Math.trunc(rounded)) : String(rounded);
        };

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const variableCost = product.variableCost || 0;
        const salePrice = product.salePrice || 0;

        const totalAmount = salePrice * quantity;
        const totalCost = variableCost * quantity;
        
        const profit = totalAmount - totalCost - (parseFloat(platformFee) || 0) - (parseFloat(deliveryFee) || 0);

        const sale = new Sale({
            product: productId,
            quantity,
            totalAmount,
            totalCost,
            profit,
            paymentMethod,
            platformFee: parseFloat(platformFee) || 0,
            deliveryFee: parseFloat(deliveryFee) || 0,
            notes: capitalizeFirstLetter(notes),
            date: (() => {
                if (date) {
                    return buildSaoPauloDate(date);
                } else {
                    // Build São Paulo "now" date
                    const todaySp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                    return buildSaoPauloDate(todaySp);
                }
            })(),
            user: req.user._id
        });

        const skipStockCheck = ignoreStockWarnings === true || ignoreStockWarnings === 'true';

        const usage = computeUsageMap(product, quantity);
        const ingIds = Array.from(usage.keys());
        if (!skipStockCheck) {
            if (ingIds.length === 0) {
                return res.status(400).json({
                    error: 'Estoque insuficiente',
                    details: ['Este produto não está vinculado ao estoque (sem ingredientes cadastrados).']
                });
            }

            const ingredients = await Ingredient.find({ _id: { $in: ingIds }, user: req.user._id });
            const byId = new Map(ingredients.map(i => [String(i._id), i]));
            const shortages = [];
            for (const [id, used] of usage.entries()) {
                const ing = byId.get(String(id));
                if (!ing) {
                    shortages.push(`Ingrediente não encontrado`);
                    continue;
                }
                const avail = ing.currentStock || 0;
                if (avail < used) {
                    shortages.push(`${ing.name}: falta ${formatQty(used - avail)} ${ing.unit}`);
                }
            }
            if (shortages.length > 0) {
                return res.status(400).json({ error: 'Estoque insuficiente', details: shortages });
            }
            const ops = [];
            for (const [id, used] of usage.entries()) {
                if (!used) continue;
                ops.push({ updateOne: { filter: { _id: id, user: req.user._id }, update: { $inc: { currentStock: -used } } } });
            }
            if (ops.length > 0) await Ingredient.bulkWrite(ops);
        }

        await sale.save();
        console.log(`✅ Sale registered: ${sale._id} for User: ${req.user.name}`);
        res.status(201).json(sale);
    } catch (err) {
        console.error('❌ Error creating sale:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update Sale
app.put('/api/sales/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { productId, quantity, date, paymentMethod, platformFee = 0, deliveryFee = 0, notes } = req.body;
        
        // Verify ownership
        const sale = await Sale.findOne({ _id: req.params.id, user: req.user._id });
        if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });

        const newProduct = await Product.findById(productId);
        if (!newProduct) return res.status(404).json({ error: 'Produto não encontrado' });
        const oldProduct = await Product.findById(sale.product);

        const totalAmount = newProduct.salePrice * quantity;
        const totalCost = newProduct.variableCost * quantity;
        const profit = totalAmount - totalCost - platformFee - deliveryFee;

        const oldUsage = oldProduct ? computeUsageMap(oldProduct, sale.quantity) : new Map();
        const newUsage = computeUsageMap(newProduct, quantity);
        const ingIds = new Set([...oldUsage.keys(), ...newUsage.keys()]);
        if (ingIds.size > 0) {
            const ingredients = await Ingredient.find({ _id: { $in: Array.from(ingIds) }, user: req.user._id });
            const byId = new Map(ingredients.map(i => [String(i._id), i]));
            const shortages = [];
            for (const id of ingIds) {
                const oldAmt = oldUsage.get(id) || 0;
                const newAmt = newUsage.get(id) || 0;
                const delta = newAmt - oldAmt;
                if (delta > 0) {
                    const ing = byId.get(String(id));
                    if (!ing) {
                        shortages.push(`Ingrediente não encontrado`);
                        continue;
                    }
                    const avail = ing.currentStock || 0;
                    if (avail < delta) shortages.push(`${ing.name}: falta ${Number(delta - avail).toFixed(3)} ${ing.unit}`);
                }
            }
            if (shortages.length > 0) {
                return res.status(400).json({ error: 'Estoque insuficiente', details: shortages });
            }
            const ops = [];
            for (const id of ingIds) {
                const oldAmt = oldUsage.get(id) || 0;
                const newAmt = newUsage.get(id) || 0;
                const delta = newAmt - oldAmt;
                if (delta !== 0) {
                    ops.push({ updateOne: { filter: { _id: id, user: req.user._id }, update: { $inc: { currentStock: -delta } } } });
                }
            }
            if (ops.length > 0) await Ingredient.bulkWrite(ops);
        }

        sale.product = productId;
        sale.quantity = quantity;
        sale.totalAmount = totalAmount;
        sale.totalCost = totalCost;
        sale.profit = profit;
        sale.paymentMethod = paymentMethod;
        sale.platformFee = platformFee;
        sale.deliveryFee = deliveryFee;
        sale.notes = capitalizeFirstLetter(notes);
        sale.date = date ? new Date(date) : sale.date;

        await sale.save();
        res.json(sale);
    } catch (err) {
        console.error('Error updating sale:', err);
        res.status(500).json({ error: 'Erro ao atualizar venda' });
    }
});

// Delete Sale
app.delete('/api/sales/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const sale = await Sale.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
        const product = await Product.findById(sale.product);
        if (product) {
            const usage = computeUsageMap(product, sale.quantity);
            const ops = [];
            for (const [id, used] of usage.entries()) {
                if (!used) continue;
                ops.push({ updateOne: { filter: { _id: id, user: req.user._id }, update: { $inc: { currentStock: used } } } });
            }
            if (ops.length > 0) await Ingredient.bulkWrite(ops);
        }
        res.json({ message: 'Venda excluída com sucesso' });
    } catch (err) {
        console.error('Error deleting sale:', err);
        res.status(500).json({ error: 'Erro ao excluir venda' });
    }
});

// API: Fixed Costs
app.get('/api/fixed-costs', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const costs = await FixedCost.find({ user: req.user._id });
        res.json(costs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fixed-costs', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { name, amount, recurrenceType, installments, date } = req.body;
        const cost = new FixedCost({
            name: capitalizeFirstLetter(name),
            amount,
            recurrenceType,
            installments,
            date: date ? new Date(date) : new Date(),
            user: req.user._id
        });
        await cost.save();
        res.status(201).json(cost);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/fixed-costs/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        const { name, amount, recurrenceType, installments, date } = req.body;
        
        const updateData = { 
            name: capitalizeFirstLetter(name), 
            amount, 
            recurrenceType, 
            installments
        };
        if (date) updateData.date = new Date(date);

        const updatedCost = await FixedCost.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            updateData,
            { new: true }
        );
        
        if (!updatedCost) return res.status(404).json({ error: 'Custo não encontrado' });
        res.json(updatedCost);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/fixed-costs/:id', authenticateToken, checkSubscription, async (req, res) => {
    try {
        await FixedCost.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Dashboard Stats (Simplified for brevity, full logic in real app)
app.get('/api/dashboard/stats', authenticateToken, checkSubscription, async (req, res) => {
    try {
        // Fetch full user data for Break Even Point
        const user = await User.findById(req.user._id);
        const { start, end, productId, monthStart, monthEnd, filterType } = req.query;
        console.log(`📊 Dashboard stats req: User=${req.user.name}, BreakEven=${user ? user.breakEvenPoint : 'NULL'}, Range=${start} to ${end}, Filter=${filterType}`); // DEBUG LOG

        // Helper: Calculate Stats for a Date Range
        const calculateStats = async (rangeStart, rangeEnd, filterProductId = null, forceFixedCosts = false) => {
            let query = { user: req.user._id };
            
            const sDate = new Date(rangeStart);
            const eDate = new Date(rangeEnd);

            // Handle YYYY-MM-DD vs ISO
            if (rangeStart.length === 10) sDate.setUTCHours(0, 0, 0, 0);
            // Fix for Timezone (Brazil UTC-3): Extend end of day to cover late night sales
            // "Today" in Brazil ends at 02:59 UTC next day. We add a buffer.
            if (rangeEnd.length === 10) eDate.setUTCHours(23 + 4, 59, 59, 999);

            query.date = { $gte: sDate, $lte: eDate };
            
            // LOGS DE DEBUG PARA CUSTO FIXO
            // console.log(`[DashboardStats] sDate (UTC): ${sDate.toISOString()}`);
            // console.log(`[DashboardStats] eDate (UTC): ${eDate.toISOString()}`);

            if (filterProductId && filterProductId !== 'all') {
                query.product = filterProductId;
            }

            const sales = await Sale.find(query).populate('product').sort({ date: 1 }); // Sort by date ascending for break-even calc

            // Fixed Costs
            let totalFixedCost = 0;
            // ONLY calculate Fixed Costs if filterType is explicitly 'thismonth' OR forced
            // User requirement: "deve aparecer o custo fixo somente na filtragem de este mes"
            if (forceFixedCosts || ((!filterProductId || filterProductId === 'all') && filterType === 'thismonth')) {
                const allFixedCosts = await FixedCost.find({ user: req.user._id });
                
                // Fixed Cost Calculation Loop (simplified for performance, but keeping logic)
                // We iterate days to handle "installment" or "monthly" accurately per day? 
                // Actually, for a range, we just need to sum applicable costs.
                // Reusing the existing logic but encapsulated or simplified.
                // For "Monthly" stats, we usually want the FULL Monthly Fixed Cost regardless of "today".
                // But the existing logic sums cost *per day* if it falls in the range.
                // If range is 1st to 30th, it sums correctly.
                
                const loopStart = new Date(sDate);
                const loopEnd = new Date(eDate);
                
                // Loop through each day in the range
                // We add a small buffer to loopEnd to ensure we include the last day if milliseconds are off
                const loopEndWithBuffer = new Date(loopEnd.getTime() + 1000);
                
                // DEBUG: Fixed Cost Loop
                console.log(`[FixedCost] Range: ${loopStart.toISOString()} to ${loopEnd.toISOString()}`);
                console.log(`[FixedCost] Costs found: ${allFixedCosts.length}`);

                for (let d = new Date(loopStart); d < loopEndWithBuffer; d.setUTCDate(d.getUTCDate() + 1)) {
                    const currentDay = d.getUTCDate();
                    const currentMonth = d.getUTCMonth();
                    const currentYear = d.getUTCFullYear();
                    
                    allFixedCosts.forEach(cost => {
                        if (!cost.date) return;
                        const costDate = new Date(cost.date);
                        if (isNaN(costDate.getTime())) return;
                        
                        const isSameMonth = d.getUTCMonth() === costDate.getUTCMonth() && d.getUTCFullYear() === costDate.getUTCFullYear();
                        
                        // LOG PARA CUSTO ESPECÍFICO
                        // if (cost.name.includes('Teste')) {
                        //     console.log(`[FixedCost-Debug] Checking cost ${cost.name} for day ${d.toISOString()}. CostDate: ${costDate.toISOString()}`);
                        // }

                        if (d < costDate && !isSameMonth) return;

                        let dueDay = costDate.getUTCDate();
                        const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
                        if (dueDay > daysInMonth) dueDay = daysInMonth;
                        
                        if (currentDay === dueDay) {
                            console.log(`[FixedCost] MATCH! Day=${currentDay}/${currentMonth + 1}, Cost=${cost.name}, Amount=${cost.amount}`);
                            if (cost.recurrenceType === 'monthly') {
                                totalFixedCost += cost.amount;
                            } else if (cost.recurrenceType === 'installment') {
                                const monthsDiff = (currentYear - costDate.getUTCFullYear()) * 12 + (currentMonth - costDate.getUTCMonth());
                                if (monthsDiff >= 0 && monthsDiff < cost.installments) {
                                    totalFixedCost += cost.amount;
                                }
                            }
                        }
                    });
                }
                console.log(`[FixedCost] Total Calculated: ${totalFixedCost}`);
            }

            // Aggregations
            let totalRevenue = 0;
            let totalVariableCost = 0;
            let totalSalesCount = sales.length;
            let totalQuantity = 0;
            let salesByMethod = { pix: 0, credit: 0, debit: 0, cash: 0 };
            let salesByDay = {};
            let productStats = {};
            let goalMetDate = null;

            // Break-even simulation
            let runningRevenue = 0;
            let runningVariableCost = 0;

            sales.forEach(sale => {
                const amount = sale.totalAmount || 0;
                const variableCost = sale.totalCost || 0;

                totalRevenue += amount;
                totalVariableCost += variableCost;
                totalQuantity += (sale.quantity || 0);
                
                // For Goal Met Check
                runningRevenue += amount;
                runningVariableCost += variableCost;
                
                // CRITICAL FIX: Determine Goal Met Date
                // If user has a Saved Break Even Point, we use that as the target.
                // If NOT, we fallback to (Fixed + Running Variable).
                // But for the Meta Card (which is monthly), we generally want to use the Saved Point if it exists.
                
                let targetGoal = 0;
                if (user && user.breakEvenPoint && user.breakEvenPoint > 0) {
                    targetGoal = user.breakEvenPoint;
                } else {
                    targetGoal = totalFixedCost + runningVariableCost;
                }
                
                // Only mark as met if we actually cross the target AND the target > 0
                if (!goalMetDate && targetGoal > 0 && runningRevenue >= targetGoal) {
                    goalMetDate = sale.date;
                }

                const method = sale.paymentMethod || 'pix';
                if (salesByMethod[method] !== undefined) salesByMethod[method]++;

                if (sale.date) {
                    const dateObj = new Date(sale.date);
                    if (!isNaN(dateObj)) {
                        const dayKey = dateObj.toISOString().split('T')[0];
                        if (!salesByDay[dayKey]) salesByDay[dayKey] = { revenue: 0, count: 0 };
                        salesByDay[dayKey].revenue += amount;
                        salesByDay[dayKey].count += 1;
                    }
                }

                if (sale.product) {
                    const pId = sale.product._id.toString();
                    const pName = sale.product.name;
                    if (!productStats[pId]) productStats[pId] = { name: pName, quantity: 0, revenue: 0 };
                    productStats[pId].quantity += sale.quantity;
                    productStats[pId].revenue += amount;
                }
            });

            const topProducts = Object.values(productStats)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);

            const grossProfit = totalRevenue - totalVariableCost;
            // Recalculate Net Profit treating Fixed Cost as a debit (Revenue - Variable - Fixed)
            const netProfit = totalRevenue - totalVariableCost - totalFixedCost;
            const ticketAverage = totalSalesCount > 0 ? (totalRevenue / totalSalesCount) : 0;

            return {
                totalRevenue,
                totalVariableCost,
                totalFixedCost,
                netProfit,
                ticketAverage,
                salesCount: totalSalesCount,
                totalQuantity,
                salesByMethod,
                salesByDay,
                topProducts,
                goalMetDate
            };
        };

        // 1. Get Main Stats (Filtered)
        const mainStats = await calculateStats(start, end, productId);

        // 2. Get Monthly Stats (For Meta Card) - Always calculate for current month
        const now = new Date();
        const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
        
        // Force Fixed Costs to be included for monthly stats, even if filterType is different
        const monthlyStats = await calculateStats(currentMonthStart.toISOString(), currentMonthEnd.toISOString(), null, true);

        // Prepare Chart Data from Main Stats
        const sortedDays = Object.keys(mainStats.salesByDay).sort();
        const chartLabels = sortedDays.map(day => {
            const [y, m, d] = day.split('-');
            return `${d}/${m}`;
        });
        const chartRevenueData = sortedDays.map(day => mainStats.salesByDay[day].revenue);
        const chartTicketData = sortedDays.map(day => {
            const dayStats = mainStats.salesByDay[day];
            return dayStats.count > 0 ? (dayStats.revenue / dayStats.count) : 0;
        });

        res.json({
            summary: {
                totalRevenue: mainStats.totalRevenue,
                totalVariableCost: mainStats.totalVariableCost,
                totalFixedCost: mainStats.totalFixedCost,
                totalCost: mainStats.totalVariableCost + mainStats.totalFixedCost,
                netProfit: mainStats.netProfit,
                ticketAverage: mainStats.ticketAverage,
                salesCount: mainStats.salesCount,
                totalQuantity: mainStats.totalQuantity,
                salesByMethod: mainStats.salesByMethod,
                topProducts: mainStats.topProducts
            },
            monthlyStats: {
                totalRevenue: monthlyStats.totalRevenue,
                totalVariableCost: monthlyStats.totalVariableCost,
                totalFixedCost: monthlyStats.totalFixedCost,
                netProfit: monthlyStats.netProfit,
                goalMetDate: monthlyStats.goalMetDate,
                percentage: (monthlyStats.totalFixedCost + monthlyStats.totalVariableCost) > 0 
                    ? (monthlyStats.totalRevenue / (monthlyStats.totalFixedCost + monthlyStats.totalVariableCost)) * 100 
                    : (monthlyStats.totalRevenue > 0 ? 100 : 0)
            },
            charts: {
                labels: chartLabels,
                revenue: chartRevenueData,
                ticket: chartTicketData
            },
            breakEvenPoint: (user && user.breakEvenPoint) ? Number(user.breakEvenPoint) : 0
        });
    } catch (err) {
        console.error('Error in dashboard stats:', err);
        res.status(500).json({ error: err.message });
    }
});


// API: Break Even Point (Save/Get)
app.get('/api/break-even', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json({
            breakEvenPoint: user.breakEvenPoint || 0,
            fixedCosts: user.fixedCostsInput || 0,
            avgRevenue: user.avgRevenueInput || 0,
            avgVariableCost: user.avgVariableCostInput || 0,
            calculatedAt: user.breakEvenCalculatedAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/break-even', authenticateToken, async (req, res) => {
    console.log(`💾 [BREAK-EVEN] Saving for user ${req.user.name} (${req.user._id})`);
    console.log('📦 Payload:', req.body);
    try {
        const { breakEvenPoint, fixedCosts, avgRevenue, avgVariableCost } = req.body;
        
        // Validate inputs to prevent "NaN" or bad data
        if (isNaN(breakEvenPoint) || isNaN(fixedCosts)) {
            console.error('❌ [BREAK-EVEN] Invalid data received');
            return res.status(400).json({ error: 'Dados inválidos' });
        }

        const updatedUser = await User.findByIdAndUpdate(req.user._id, {
            breakEvenPoint,
            fixedCostsInput: fixedCosts,
            avgRevenueInput: avgRevenue,
            avgVariableCostInput: avgVariableCost,
            breakEvenCalculatedAt: new Date()
        }, { new: true }); // Return updated doc
        
        console.log('✅ [BREAK-EVEN] Saved. New Point:', updatedUser.breakEvenPoint);
        res.json({ success: true, message: 'Dados de Ponto de Equilíbrio salvos.' });
    } catch (err) {
        console.error('❌ [BREAK-EVEN] Error saving:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Dicas de Vendas (AI Tip for Break-Even Progress)
app.post('/api/dicas-vendas', authenticateToken, async (req, res) => {
    try {
        const { metaFaturamento, vendasAtuais } = req.body;
        
        if (!metaFaturamento || metaFaturamento <= 0) {
            return res.json({ success: true, dica: 'Defina sua meta primeiro para receber dicas personalizadas!' });
        }

        const percentage = (vendasAtuais / metaFaturamento) * 100;
        
        const prompt = `
        Aja como uma consultora financeira especialista em confeitaria (Belle Cake).
        A usuária tem uma meta de Ponto de Equilíbrio de R$ ${Number(metaFaturamento).toFixed(2)}.
        Atualmente ela faturou R$ ${Number(vendasAtuais).toFixed(2)} (${percentage.toFixed(1)}% da meta).
        
        Dê uma dica CURTA (máximo 30 palavras) e MOTIVADORA.
        - Se < 50%: Dica de ação rápida para vender hoje (ex: promoção relâmpago, oferta no WhatsApp).
        - Se 50-90%: "Falta pouco!", sugira focar nos produtos mais vendidos.
        - Se > 100%: Parabenize e sugira focar em lucro (reduzir desperdício).
        Tom amigável e direto.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100,
            temperature: 0.7
        });

        // Track Usage
        if (completion.usage) {
            const inputCost = (completion.usage.prompt_tokens / 1000000) * 0.15;
            const outputCost = (completion.usage.completion_tokens / 1000000) * 0.60;
            const totalCost = inputCost + outputCost;

            await OpenAIUsage.create({
                user: req.user._id,
                endpoint: '/api/dicas-vendas',
                model: 'gpt-4o-mini',
                tokens_input: completion.usage.prompt_tokens,
                tokens_output: completion.usage.completion_tokens,
                cost_usd: totalCost
            });
        }

        const dica = completion.choices[0].message.content.trim();
        res.json({ success: true, dica });

    } catch (err) {
        console.error('❌ [DICAS] Error generating tip:', err);
        // Fallback message so UI doesn't break
        res.json({ success: false, message: 'Continue firme! Revise seus custos e foque nas vendas.' });
    }
});

app.get('/api/break-even', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        console.log(`📤 [BREAK-EVEN] Sending data for ${user.name}: Point=${user.breakEvenPoint}`);
        
        res.json({
            breakEvenPoint: user.breakEvenPoint || 0,
            fixedCosts: user.fixedCostsInput || 0,
            avgRevenue: user.avgRevenueInput || 0,
            avgVariableCost: user.avgVariableCostInput || 0
        });
    } catch (err) {
        console.error('❌ [BREAK-EVEN] Error fetching:', err);
        res.status(500).json({ error: err.message });
    }
});

// API: Transcribe Audio (Voice to Text for New Sale)
app.post('/api/stock/photo', authenticateToken, checkSubscription, upload.single('image'), async (req, res) => {
    let filePath = '';
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OPENAI_API_KEY não configurada para análise de imagem.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
        }

        const originalName = req.file.originalname || '';
        const extension = path.extname(originalName) || '.jpg';
        filePath = req.file.path + extension;
        fs.renameSync(req.file.path, filePath);

        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        let mime = 'image/jpeg';
        if (extension.toLowerCase() === '.png') mime = 'image/png';
        if (extension.toLowerCase() === '.webp') mime = 'image/webp';
        const imageUrl = `data:${mime};base64,${base64}`;

        const today = new Date().toISOString().split('T')[0];
        const systemPrompt = `
Hoje é ${today}. Você é uma assistente que analisa fotos de compras ou prateleiras de ingredientes de confeitaria para atualizar o estoque.

Retorne APENAS um JSON com a estrutura:
{
  "items": [
    {
      "name": "nome do ingrediente",
      "unit": "g" ou "un",
      "quantity": 1000
    }
  ]
}

Regras:
- Concentre-se em ingredientes de confeitaria (ex: leite condensado, farinha de trigo, açúcar, ovos).
- Sempre normalize o nome em Sentence case (apenas a primeira letra maiúscula).
- Se a unidade estiver em kg, converta para g (1 kg = 1000 g).
- Se a unidade estiver em caixas, pacotes, latas etc, converta para unidades inteiras (unit = "un").
- "quantity" deve representar quanto será ADICIONADO ao estoque (não o total final já existente).
- Se tiver dúvida em algum item, ignore-o para evitar erro.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Analise esta imagem e extraia os ingredientes e quantidades para adicionar ao estoque.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl
                            }
                        }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        });

        if (completion.usage) {
            const inputCost = (completion.usage.prompt_tokens / 1000000) * 0.15;
            const outputCost = (completion.usage.completion_tokens / 1000000) * 0.60;
            const totalCost = inputCost + outputCost;

            await OpenAIUsage.create({
                user: req.user._id,
                endpoint: '/api/stock/photo',
                model: 'gpt-4o-mini',
                tokens_input: completion.usage.prompt_tokens,
                tokens_output: completion.usage.completion_tokens,
                cost_usd: totalCost
            });
        }

        const parsed = JSON.parse(completion.choices[0].message.content);
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        const userIngredients = await Ingredient.find({ user: req.user._id });
        const byName = new Map();
        for (const ing of userIngredients) {
            if (!ing.name) continue;
            byName.set(String(ing.name).trim().toLowerCase(), ing);
        }

        const ops = [];
        const updated = [];
        const notFound = [];
        const skipped = [];

        for (const raw of items) {
            if (!raw || !raw.name) continue;
            const name = String(raw.name).trim();
            const key = name.toLowerCase();
            const unit = (raw.unit || '').toLowerCase();
            const qty = Number(raw.quantity);

            if (!unit || (unit !== 'g' && unit !== 'un')) {
                skipped.push({ name, reason: 'unit' });
                continue;
            }
            if (!qty || !isFinite(qty) || qty <= 0) {
                skipped.push({ name, reason: 'quantity' });
                continue;
            }

            const ing = byName.get(key);
            if (!ing) {
                notFound.push(name);
                continue;
            }

            if (ing.unit !== unit) {
                skipped.push({ name, reason: 'unit_mismatch', expected: ing.unit, received: unit });
                continue;
            }

            const before = ing.currentStock || 0;
            const after = before + qty;

            ops.push({
                updateOne: {
                    filter: { _id: ing._id, user: req.user._id },
                    update: { $set: { currentStock: after } }
                }
            });
            updated.push({
                name,
                unit,
                added: qty,
                before,
                after
            });
        }

        if (ops.length > 0) {
            await Ingredient.bulkWrite(ops);
        }

        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({
            success: true,
            updated,
            notFound,
            skipped
        });
    } catch (err) {
        console.error('Erro ao processar imagem do estoque:', err);
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        } else if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Erro ao analisar foto do estoque.', details: err.message });
    }
});

app.post('/api/transcribe', authenticateToken, checkSubscription, upload.single('audio'), async (req, res) => {
    let filePath = '';
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

        // OpenAI requires a valid file extension to determine format
        // Multer saves as temp file without extension, so we must rename it
        const originalName = req.file.originalname;
        const extension = path.extname(originalName) || '.webm'; // Default to .webm if missing
        filePath = req.file.path + extension;
        
        // Rename the file to include extension
        fs.renameSync(req.file.path, filePath);

        const type = req.body.type || 'sale'; // 'sale' or 'ingredient'

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "pt",
            response_format: "verbose_json"
        });

        const text = transcription.text;
        const duration = transcription.duration; // Duration in seconds

        // Track Whisper Usage
        if (duration) {
            const minutes = duration / 60;
            const whisperCost = minutes * 0.006; // $0.006 per minute
            
            await OpenAIUsage.create({
               user: req.user._id,
               endpoint: '/api/transcribe',
               model: 'whisper-1',
               duration_seconds: duration,
               cost_usd: whisperCost
           });
       }

        console.log('Transcribed text:', text);

        let systemPrompt = '';
        const today = new Date().toISOString().split('T')[0];

        if (type === 'ingredient') {
            systemPrompt = `Hoje é ${today}. Você é um assistente que extrai informações de cadastro de ingredientes de um texto transcrito de áudio.
            
            Instruções:
            1. O texto pode conter UM ou MÚLTIPLOS ingredientes falados sequencialmente.
            2. Identifique cada ingrediente separado por pausas ou contexto.
            3. Retorne OBRIGATORIAMENTE um JSON com a estrutura:
               {
                 "ingredients": [
                   {
                     "name": "nome do ingrediente",
                     "price": 10.50, // número
                     "quantityPackage": 500, // número
                     "unit": "g" // 'g', 'ml', 'un'
                   },
                   ...
                 ]
               }
            4. Converta unidades faladas como 'kilo', 'kg' para 1000g. 'Litro' para 1000ml.
            5. Se o preço for falado como "10 reais", price é 10.
            6. Se faltar algum dado de um item, tente inferir pelo contexto ou omita o campo, mas inclua o item.
            7. IMPORTANTE: Corrija a capitalização dos nomes para o padrão 'Sentence case' (Apenas a primeira letra maiúscula, o resto minúsculo). Exemplo: converta "OLeo" para "Oleo", "LEITE" para "Leite", "farinha De TRIGO" para "Farinha de trigo".`;
        } else {
            // Default: Sale
            // Get user's products for better matching
            let productNames = [];
            if (req.user && req.user._id) {
                const products = await Product.find({ user: req.user._id }).select('name');
                productNames = products.map(p => p.name);
            }

            systemPrompt = `Hoje é ${today}. Você é um assistente que extrai informações de vendas de um texto.
            
            Lista de produtos cadastrados do usuário:
            ${productNames.join(', ')}

            Instruções:
            1. Tente encontrar o produto da lista acima que melhor corresponde ao falado. Se encontrar, use o nome EXATO da lista no campo 'productName'. Se não, use o nome falado.
            2. Retorne APENAS um JSON válido com os campos: 
               - productName (string)
               - quantity (number)
               - paymentMethod (string: 'pix', 'credit', 'debit', 'cash', 'platform')
               - date (string YYYY-MM-DD)
               - feeValue (number, optional, para taxas/iFood)
               - feeType (string: 'percent' ou 'money', optional, default 'money')
               - deliveryFee (number, optional, para entrega).
            3. Se faltar algo, omita o campo.`;
        }

        // Parse with GPT to extract fields
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: systemPrompt
                },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });

        // Track GPT Usage
        if (completion.usage) {
            const inputCost = (completion.usage.prompt_tokens / 1000000) * 0.15;
            const outputCost = (completion.usage.completion_tokens / 1000000) * 0.60;
            const totalCost = inputCost + outputCost;

            await OpenAIUsage.create({
                user: req.user._id,
                endpoint: '/api/transcribe',
                model: 'gpt-4o-mini',
                tokens_input: completion.usage.prompt_tokens,
                tokens_output: completion.usage.completion_tokens,
                cost_usd: totalCost
            });
        }

        const parsedData = JSON.parse(completion.choices[0].message.content);
        
        // Cleanup file
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        res.json({ text, parsedData });
    } catch (err) {
        console.error('Transcription error:', err);
        // Cleanup on error
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        else if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        
        res.status(500).json({ error: 'Erro na transcrição', details: err.message });
    }
});

// API endpoint for sales tips (OpenAI integration)
app.post('/api/dicas-vendas', async (req, res) => {
    console.log('Recebendo requisição em /api/dicas-vendas');
    console.log('Body:', req.body);
    try {
        // Validar e converter input
        const metaFaturamento = parseFloat(req.body.metaFaturamento);
        const vendasAtuais = parseFloat(req.body.vendasAtuais);
        
        if (isNaN(metaFaturamento) || isNaN(vendasAtuais)) {
            console.error('Dados inválidos (NaN):', req.body);
            return res.status(400).json({ success: false, message: 'Dados inválidos. Certifique-se de enviar números.' });
        }
        
        // Verificar API Key (fallback local se ausente)
        const apiKeyMissing = !process.env.OPENAI_API_KEY;

        const faltam = metaFaturamento - vendasAtuais;
        const hoje = new Date();
        const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const diasRestantes = ultimoDiaMes.getDate() - hoje.getDate();
        
        // Formatar valores para BRL
        const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const metaFormatted = formatter.format(metaFaturamento);
        const vendasFormatted = formatter.format(vendasAtuais);
        const faltamFormatted = formatter.format(Math.max(0, faltam));

        // Calcular Ritmo (Projeção)
        const daysPassed = Math.max(1, hoje.getDate()); // Avoid division by zero
        const daysInMonth = ultimoDiaMes.getDate();
        const dailyAvg = vendasAtuais / daysPassed;
        const projectedRevenue = dailyAvg * daysInMonth;
        const projectedFormatted = formatter.format(projectedRevenue);
        
        const isOnTrack = projectedRevenue >= metaFaturamento;
        
        let paceText = '';
        if (isOnTrack) {
            paceText = `🚀 Ritmo Excelente: Se continuar assim, você fechará o mês com aprox. ${projectedFormatted} (acima da meta de ${metaFormatted}).`;
        } else {
            paceText = `⚠️ Atenção ao Ritmo: No ritmo atual, a projeção é fechar com ${projectedFormatted}. Precisamos acelerar!`;
        }

        // Determinar cenário e buscar estratégias
        let scenario = 'below_break_even';
        let goalText = `Faltam faturar: ${faltamFormatted} para atingir o ponto de equilíbrio.`;
        let systemRole = "Você é um consultor especialista em recuperação financeira e vendas para confeitarias.";
        
        if (faltam <= 0) {
            scenario = 'above_break_even';
            goalText = `A meta foi atingida! O faturamento atual é ${vendasFormatted} (acima da meta de ${metaFormatted}). O objetivo agora é lucrar mais e crescer.`;
            systemRole = "Você é um consultor especialista em expansão de negócios e gestão de lucros para confeitarias.";
        } else if (isOnTrack) {
             // If below goal but on track (early in the month), adjust tone
             scenario = 'on_track';
             goalText = `Você ainda não bateu a meta, mas está no caminho certo! ${paceText}`;
             systemRole = "Você é um consultor motivacional e estrategista para manter o ritmo de vendas.";
        } else {
             goalText += `\n${paceText}`;
        }

        // Buscar estratégias no "Mini-DB"
        let strategies = [];
        try {
            // Map 'on_track' back to 'below_break_even' strategies for now, or mix
            const searchScenario = scenario === 'on_track' ? 'below_break_even' : scenario;
            strategies = await FinancialStrategy.find({ scenario: searchScenario });
        } catch (dbError) {
            console.error('Erro ao buscar estratégias (DB):', dbError);
        }
        
        // Buscar produtos do usuário para contexto
        let userProducts = [];
        try {
            if (req.user && req.user.id) {
                userProducts = await Product.find({ user: req.user.id }).limit(10); // Increased limit
            }
        } catch (err) {
            console.warn('Erro ao buscar produtos para dica:', err.message);
        }
        
        const hasProducts = userProducts.length > 0;
        
        const productsText = hasProducts
            ? userProducts.map(p => {
                const custo = p.totalCost !== undefined && p.totalCost !== null ? Number(p.totalCost) : 0;
                const preco = p.sellingPrice !== undefined && p.sellingPrice !== null ? Number(p.sellingPrice) : 0;
                return `- ${p.name} (Custo: R$${custo.toFixed(2)}, Preço: R$${preco.toFixed(2)})`;
            }).join('\n')
            : 'NENHUM PRODUTO CADASTRADO.';

        // Fallback if no strategies found
        if (!strategies || strategies.length === 0) {
            strategies = [
                { title: 'Redução de Custos', content: 'Negocie com fornecedores para compras em maior volume.', source: 'Sistema' },
                { title: 'Aumento de Ticket Médio', content: 'Crie kits de produtos para aumentar o valor da venda.', source: 'Sistema' },
                { title: 'Promoção Relâmpago', content: 'Faça ofertas limitadas para gerar urgência.', source: 'Sistema' },
                { title: 'Fidelização', content: 'Ofereça um brinde na próxima compra.', source: 'Sistema' }
            ];
        }

        let selectedStrategies;
        if (strategies.length <= 2) {
            selectedStrategies = strategies;
        } else {
            selectedStrategies = strategies.sort(() => 0.5 - Math.random()).slice(0, 2);
        }
        
        const strategiesText = selectedStrategies.map(s => `- ${s.title}: ${s.content} (Fonte: ${s.source})`).join('\n');

        const prompt = `
            Contexto do usuário:
            - Meta de Faturamento (Ponto de Equilíbrio): ${metaFormatted} por mês.
            - Vendas realizadas até hoje (dia ${hoje.getDate()}): ${vendasFormatted}.
            - ${goalText}
            - Dias restantes no mês: ${diasRestantes} dias.
            
            Produtos Disponíveis (Inventário):
            ${productsText}
            
            Base de Conhecimento (Estratégias Genéricas):
            ${strategiesText}
            
            Instruções CRITICAS:
            1. Analise o RITMO de vendas. Se estiver bom (projetado > meta), parabenize e sugira manter/escalar. Se estiver ruim, sugira ações de correção imediata.
            2. SOBRE OS PRODUTOS:
               - SE existirem produtos na lista acima: USE APENAS ELES em seus exemplos. Não invente produtos. Diga algo como "Use o [Nome do Produto] para fazer um combo...".
               - SE NÃO existirem produtos (Lista vazia): Você DEVE sugerir a criação de 2 produtos novos (ex: "Sugiro criar um Bolo no Pote por R$ 15,00 e um Brigadeiro Gourmet por R$ 5,00") para ajudar a bater a meta.
            3. Dê uma dica curta, prática e valiosa (máximo 2 parágrafos).
            
            IMPORTANTE - Contexto do Público:
            - Confeiteiras que vendem por WhatsApp/Instagram.
            - Vendas manuais (sem checkout automático complexo).
            - Seja direta, amigável e use emojis.
        `;

        // Fallback local generator
        const buildFallbackTip = () => {
            // Select a random product if available
            let prodText = 'um produto carro-chefe';
            if (userProducts.length > 0) {
                const randomProd = userProducts[Math.floor(Math.random() * userProducts.length)];
                prodText = `o produto "${randomProd.name}"`;
            }

            // Determine specific action based on scenario
            let action = '';
            if (scenario === 'below_break_even') {
                action = `Faça uma "Promoção Relâmpago" (24h) com ${prodText}. Crie um combo ou dê um desconto progressivo para gerar caixa rápido.`;
            } else {
                action = `Aproveite o bom momento para fidelizar! Envie uma mensagem para quem comprou ${prodText} oferecendo um benefício na próxima compra.`;
            }

            const s1 = selectedStrategies[0]?.title ? `${selectedStrategies[0].title}: ${selectedStrategies[0].content}` : 'Revise seus custos variáveis.';
            const s2 = selectedStrategies[1]?.title ? `${selectedStrategies[1].title}: ${selectedStrategies[1].content}` : 'Poste fotos apetitosas nos stories.';

            return `💡 Dica Personalizada (Modo Offline):\n\n` +
                   `📊 Status: ${metaFormatted} (Meta) vs ${vendasFormatted} (Atual)\n` +
                   `🎯 Faltam: ${faltamFormatted} | Dias: ${diasRestantes}\n\n` +
                   `🚀 Ação Recomendada: ${action}\n\n` +
                   `✨ Outras ideias: ${s1} | ${s2}`;
        };

        let dica;
        if (apiKeyMissing) {
            console.warn('Gerando dica via fallback local (sem OPENAI_API_KEY).');
            dica = buildFallbackTip();
        } else {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemRole },
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 300,
                });
                dica = completion.choices[0].message.content;
            } catch (openaiError) {
                console.error('Erro na chamada OpenAI:', openaiError);
                dica = buildFallbackTip();
            }
        }

        res.json({ success: true, dica });

    } catch (err) {
        console.error('❌ Error in /api/dicas-vendas:', err);
        res.status(500).json({ success: false, message: 'Erro ao processar solicitação.' });
    }
});

// --- Endpoint: Classificar Custo (IA) ---
app.post('/api/classificar-custo', authenticateToken, async (req, res) => {
    try {
        const { item } = req.body;
        if (!item) return res.status(400).json({ success: false, message: 'Item é obrigatório' });

        // Check if OpenAI key is configured
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
             // Fallback logic if no API Key
             const lower = item.toLowerCase();
             let isFixed = false;
             let reason = 'Classificação baseada em regras simples (Modo Offline).';
             
             // Simple heuristics
             if (lower.includes('aluguel') || lower.includes('internet') || lower.includes('luz') || lower.includes('salário') || lower.includes('mei') || lower.includes('sistema')) {
                 isFixed = true;
             }
             
             return res.json({
                 success: true,
                 data: {
                     classificacao: isFixed ? 'Custo Fixo' : 'Custo Variável',
                     explicacao: reason
                 }
             });
        }

        const prompt = `
        Aja como um especialista em contabilidade para confeitaria.
        Classifique o seguinte item de custo: "${item}".
        
        Responda APENAS um JSON no seguinte formato (sem markdown, sem crases):
        {
          "classificacao": "Custo Fixo" ou "Custo Variável",
          "explicacao": "Uma frase curta explicando o porquê."
        }
        
        Definições:
        - Custo Fixo: Aquele que você paga todo mês independente de vender ou não (ex: Aluguel, Internet, MEI).
        - Custo Variável: Aquele que aumenta quanto mais você produz/vende (ex: Farinha, Embalagem, Gás, Taxa de Cartão).
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100
        });

        // Track Usage
        if (completion.usage) {
            const inputCost = (completion.usage.prompt_tokens / 1000000) * 0.15;
            const outputCost = (completion.usage.completion_tokens / 1000000) * 0.60;
            const totalCost = inputCost + outputCost;

            await OpenAIUsage.create({
                user: req.user._id,
                endpoint: '/api/classificar-custo',
                model: 'gpt-4o-mini',
                tokens_input: completion.usage.prompt_tokens,
                tokens_output: completion.usage.completion_tokens,
                cost_usd: totalCost
            });
        }

        const content = completion.choices[0].message.content.trim();
        // Remove potential markdown code blocks if any
        const jsonStr = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        
        let result;
        try {
            result = JSON.parse(jsonStr);
        } catch (e) {
            console.error('Error parsing AI response:', content);
            // Fallback default
            result = { classificacao: 'Indefinido', explicacao: 'Não foi possível classificar automaticamente.' };
        }

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('Error in /api/classificar-custo:', error);
        res.status(500).json({ success: false, message: 'Erro ao classificar custo' });
    }
});

// Webhook for Cakto (Payment Integration)
app.post('/api/webhook/cakto', async (req, res) => {
    try {
        const data = req.body;
        console.log('🔔 [WEBHOOK] Received Payload:', JSON.stringify(data, null, 2));

        // 1. Data Extraction (Robust for Arrays and Objects)
        // Cakto payload often comes as { data: [ { ... } ] }
        let payloadData = {};
        
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            console.log('📦 [WEBHOOK] Detected Array Payload. Using first item.');
            payloadData = data.data[0];
        } else if (data.data && typeof data.data === 'object') {
            console.log('📦 [WEBHOOK] Detected Object Payload (nested data).');
            payloadData = data.data;
        } else {
            console.log('📦 [WEBHOOK] Detected Flat Payload.');
            payloadData = data;
        }
        
        // Extract Status
        const statusRaw = (
            payloadData.status || 
            payloadData.current_status || 
            data.status || 
            ''
        ).toLowerCase();
        
        // Extract Event
        // Sometimes event is at root, sometimes implied by content
        const eventRaw = (data.event || payloadData.event || '').toLowerCase();
        
        // Extract Email (Try all common paths in the resolved payloadData)
        const email = (
            payloadData.customer?.email || 
            payloadData.payer?.email || 
            payloadData.email || // Direct email field
            data.customer?.email ||
            data.payer?.email ||
            ''
        ).trim();

        // Extract Name
        const name = (
            payloadData.customer?.name || 
            payloadData.payer?.name || 
            payloadData.name || // Direct name field
            data.customer?.name || 
            data.payer?.name || 
            'Cliente'
        ).trim();

        // Extract Offer/Product Name for Plan Determination
        let offerName = (
            payloadData.offer?.name || 
            ''
        ).toUpperCase();
        
        let productName = (
            payloadData.product?.name || 
            ''
        ).toUpperCase();

        // REPLACE 'PLANILHA' WITH 'FERRAMENTA' to normalize inputs
        offerName = offerName.replace(/PLANILHA/g, 'FERRAMENTA');
        productName = productName.replace(/PLANILHA/g, 'FERRAMENTA');

        const combinedName = `${offerName} ${productName}`;

        console.log(`🔍 [WEBHOOK] Parsed: Event="${eventRaw}", Status="${statusRaw}", Email="${email}", CombinedName="${combinedName}"`);

        // 2. Validation Logic
        // Payment is valid if:
        // - Status is paid/approved/completed OR
        // - Event contains "pix" OR
        // - Payload contains a "pix" object (implied Pix transaction)
        
        const isPaidStatus = ['paid', 'approved', 'completed'].includes(statusRaw);
        const isPixEvent = eventRaw.includes('pix');
        const hasPixObject = !!payloadData.pix; // Check if 'pix' object exists in payload
        
        console.log(`🤔 [WEBHOOK] Checks: PaidStatus=${isPaidStatus}, PixEvent=${isPixEvent}, HasPixObject=${hasPixObject}`);

        const shouldProcess = isPaidStatus || isPixEvent || hasPixObject;

        if (!shouldProcess) {
            console.log(`⏸️ [WEBHOOK] Ignoring: Not a paid/pix event. (Status: ${statusRaw}, Event: ${eventRaw})`);
            return res.json({ ignored: true, reason: 'status_not_paid_or_pix' });
        }

        if (!email) {
            console.error('❌ [WEBHOOK] Error: Email not found in payload.');
            return res.json({ error: 'email_missing' });
        }

        console.log('✅ [WEBHOOK] Processing valid payment for:', email);

        // Determine Plan based on Offer Name
        // "PLANILHA PRECIFICAÇÃO - ACESSO COMPLETO" -> complete
        // "PLANILHA PRECIFICAÇÃO" -> basic
        let planType = 'basic';
        const keywords = ['COMPLETO', 'UPGRADE', 'VITALÍCIO', 'VITALICIO', 'LIFETIME', 'PREMIUM', 'FLUXO'];
        if (keywords.some(k => combinedName.includes(k))) {
            planType = 'complete';
        }
        console.log(`📋 [WEBHOOK] Plan determined: ${planType} (Source: ${combinedName})`);

        // Check for "Massas Perfeitas" (Order Bump)
        let massasPerfeitasAccess = false;
        if (combinedName.includes('MASSAS PERFEITAS')) {
            massasPerfeitasAccess = true;
            console.log('🍰 [WEBHOOK] Massas Perfeitas Access Granted!');
        }

        // --- Subscription Logic for Fluxo de Caixa ---
        let subType = 'paid'; // default
        // Default to 30 days (1 month) as per requirement for Complete plan users
        let subExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); 

        // Specific Logic for Fluxo de Caixa
         if (combinedName.includes('FLUXO')) {
             if (combinedName.includes('VITALÍCIO') || combinedName.includes('VITALICIO') || combinedName.includes('LIFETIME')) {
                 subType = 'lifetime';
                 subExpires = new Date('2099-12-31T23:59:59.999Z'); // Effectively forever
                 console.log('♾️ [WEBHOOK] Detected Lifetime Fluxo Plan');
             } else {
                 // Monthly (Explicit)
                 subType = 'paid';
                 subExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days
                 console.log('📅 [WEBHOOK] Detected Monthly Fluxo Plan (30 days)');
             }
         }

        // 3. User Management (MongoDB)
        let user = await User.findOne({ email });
        let password = '';
        let isNewUser = false;
        
        // Generate Permanent Access Token for User
        // We need a temporary user object ID if new, or existing ID
        const userIdForToken = user ? user._id : new mongoose.Types.ObjectId();
        const userToken = jwt.sign(
            { _id: userIdForToken, name: name }, 
            process.env.JWT_SECRET
        );

        if (!user) {
            // Create new user
            password = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(password, 10);
            
            user = new User({
                _id: userIdForToken, // Explicitly set ID to match token
                name,
                email,
                password: hashedPassword,
                plan: planType,
                token: userToken, // Save Token
                subscriptionStatus: 'active',
                subscriptionType: subType,
                subscriptionExpiresAt: subExpires,
                massasPerfeitasAccess: massasPerfeitasAccess
            });
            await user.save();
            isNewUser = true;
            console.log('🆕 [WEBHOOK] User created:', email);
        } else {
            // Update existing user
            // Always update token on new purchase/webhook event
            // Logic to prevent downgrade: If user is already 'complete', don't revert to 'basic'
            // unless the new plan is explicitly 'complete' (redundant) or we decide to allow downgrades.
            // But usually we want to KEEP complete.
            
            if (user.plan === 'complete' && planType === 'basic') {
                console.log(`🛡️ [WEBHOOK] Prevented downgrade for ${email}. Keeping 'complete' plan.`);
                planType = 'complete';
            }

            user.plan = planType;
            user.token = userToken;
            user.subscriptionStatus = 'active';
            user.subscriptionType = subType;
            user.subscriptionExpiresAt = subExpires;
            
            // Grant access if detected in this webhook, but do NOT revoke if it was already true
            if (massasPerfeitasAccess) {
                user.massasPerfeitasAccess = true;
            }
            
            await user.save();
            console.log('🔄 [WEBHOOK] User updated (Plan & Token):', email);
        }

        // 4. Email Notification (Nodemailer)
        // Only send email if it's a new user. Existing users upgrading don't need a new email.
        if (isNewUser) {
            const loginLink = `https://bellecake.com/membros?token=${userToken}`;

            const mailOptions = {
                from: `"BelleCake" <${process.env.EMAIL_USER || process.env.SMTP_USER}>`,
                to: email,
                subject: 'Seu Acesso ao BelleCake Chegou! 🍰',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #d4a373;">Parabéns pela compra!</h2>
                        <p>Olá, <strong>${name}</strong>!</p>
                        <p>Seu pagamento foi confirmado e seu acesso ao <strong>BelleCake</strong> está liberado.</p>
                        
                        <div style="background-color: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                            <p><strong>Login:</strong> ${email}</p>
                            <p><strong>Senha:</strong> ${password}</p>
                            <p style="margin-top: 15px;">
                                <a href="${loginLink}" style="background-color: #d4a373; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Acessar Área de Membros</a>
                            </p>
                        </div>

                        <p>Se precisar de ajuda, responda este e-mail.</p>
                        <p>Com carinho,<br>Equipe BelleCake</p>
                    </div>
                `
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error('❌ [WEBHOOK] Email send error:', err);
                } else {
                    console.log('📧 [WEBHOOK] Email sent:', info.messageId);
                }
            });
        } else {
            console.log('📧 [WEBHOOK] Email skipped for existing user update.');
        }

        return res.json({ received: true, user_created: isNewUser });

    } catch (error) {
        console.error('❌ [WEBHOOK] Critical Error:', error);
        return res.status(500).json({ error: 'internal_server_error' });
    }
});

// Start Server
// Cleanup uploads folder on start
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
} else {
    fs.readdir(uploadsDir, (err, files) => {
        if (err) console.error('Error reading uploads dir:', err);
        else {
            for (const file of files) {
                if (file !== '.gitkeep') { // Preserve .gitkeep if it exists
                    fs.unlink(path.join(uploadsDir, file), err => {
                        if (err) console.error(`Error deleting file ${file}:`, err);
                    });
                }
            }
            console.log('🧹 Uploads folder cleaned up');
        }
    });
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
