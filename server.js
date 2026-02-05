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
const Sale = require('./models/Sale');
const FixedCost = require('./models/FixedCost');
const VariableCost = require('./models/VariableCost'); // If needed
const FinancialStrategy = require('./models/FinancialStrategy');

// OpenAI Config
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
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
        
        // Check Expiration for ALL users who have a subscription date
        if (user.subscriptionExpiresAt) {
            // Check if expired
            if (now > new Date(user.subscriptionExpiresAt)) {
                // Auto-update status if needed
                if (user.subscriptionStatus !== 'expired') {
                    user.subscriptionStatus = 'expired';
                    await user.save();
                }
                
                return res.status(403).json({ 
                    error: 'Sua assinatura expirou.', 
                    code: 'SUBSCRIPTION_EXPIRED',
                    expiredAt: user.subscriptionExpiresAt 
                });
            }
        }
        
        // Check Status
        if (user.subscriptionStatus === 'expired') {
             return res.status(403).json({ 
                error: 'Sua assinatura expirou.', 
                code: 'SUBSCRIPTION_EXPIRED',
                expiredAt: user.subscriptionExpiresAt 
            });
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
app.get('/membros', (req, res) => res.sendFile(path.join(__dirname, 'views', 'membros.html')));
app.get('/equilibrio', (req, res) => res.sendFile(path.join(__dirname, 'views', 'equilibrio.html')));
app.get('/apresentacao', (req, res) => res.sendFile(path.join(__dirname, 'views', 'apresentacao.html')));
app.get('/aulas', (req, res) => res.sendFile(path.join(__dirname, 'views', 'aulas.html')));
app.get('/upgrade', (req, res) => res.sendFile(path.join(__dirname, 'views', 'upgrade.html')));
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
        const { name, salePrice, variableCost } = req.body;
        const product = new Product({
            name,
            salePrice,
            variableCost,
            user: req.user._id
        });
        await product.save();
        res.status(201).json(product);
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

        console.log('📥 Received POST /api/sales body:', req.body); // Log incoming data
        const { productId, quantity, date, paymentMethod, platformFee = 0, deliveryFee = 0, notes } = req.body;
        
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const variableCost = product.variableCost || 0; // Handle missing cost
        const salePrice = product.salePrice || 0;

        const totalAmount = salePrice * quantity;
        const totalCost = variableCost * quantity;
        
        // Calculate Net Profit: (Revenue - ProductCost - Fees - Delivery)
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
            notes,
            date: date ? new Date(date.includes('T') ? date : date + 'T12:00:00.000Z') : new Date(),
            user: req.user._id
        });

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

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

        const totalAmount = product.salePrice * quantity;
        const totalCost = product.variableCost * quantity;
        const profit = totalAmount - totalCost - platformFee - deliveryFee;

        sale.product = productId;
        sale.quantity = quantity;
        sale.totalAmount = totalAmount;
        sale.totalCost = totalCost;
        sale.profit = profit;
        sale.paymentMethod = paymentMethod;
        sale.platformFee = platformFee;
        sale.deliveryFee = deliveryFee;
        sale.notes = notes;
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
            name,
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
            name, 
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
        const { start, end, productId, monthStart, monthEnd } = req.query;
        console.log(`📊 Dashboard stats req: User=${req.user.name}, Range=${start} to ${end}`); // DEBUG LOG

        // Helper: Calculate Stats for a Date Range
        const calculateStats = async (rangeStart, rangeEnd, filterProductId = null) => {
            let query = { user: req.user._id };
            
            const sDate = new Date(rangeStart);
            const eDate = new Date(rangeEnd);

            // Handle YYYY-MM-DD vs ISO
            if (rangeStart.length === 10) sDate.setUTCHours(0, 0, 0, 0);
            // Fix for Timezone (Brazil UTC-3): Extend end of day to cover late night sales
            // "Today" in Brazil ends at 02:59 UTC next day. We add a buffer.
            if (rangeEnd.length === 10) eDate.setUTCHours(23 + 4, 59, 59, 999);

            query.date = { $gte: sDate, $lte: eDate };
            
            if (filterProductId && filterProductId !== 'all') {
                query.product = filterProductId;
            }

            const sales = await Sale.find(query).populate('product').sort({ date: 1 }); // Sort by date ascending for break-even calc

            // Fixed Costs
            let totalFixedCost = 0;
            if (!filterProductId || filterProductId === 'all') {
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
                        if (d < costDate && !isSameMonth) return;

                        let dueDay = costDate.getUTCDate();
                        const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
                        if (dueDay > daysInMonth) dueDay = daysInMonth;
                        
                        if (currentDay === dueDay) {
                            console.log(`[FixedCost] MATCH! Day=${currentDay}, Cost=${cost.name}, Amount=${cost.amount}`);
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
                
                // For Goal Met Check (Revenue >= Fixed + Variable)
                // Note: Fixed Cost is "Total for the period". We assume it exists from day 1 for the break-even target.
                runningRevenue += amount;
                runningVariableCost += variableCost;
                
                if (!goalMetDate && runningRevenue >= (totalFixedCost + runningVariableCost)) {
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
        
        const monthlyStats = await calculateStats(currentMonthStart.toISOString(), currentMonthEnd.toISOString(), null);

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
            }
        });
    } catch (err) {
        console.error('Error in dashboard stats:', err);
        res.status(500).json({ error: err.message });
    }
});


// API: Transcribe Audio (Voice to Text for New Sale)
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

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "pt"
        });

        const text = transcription.text;
        console.log('Transcribed text:', text);

        // Get user's products for better matching
        let productNames = [];
        if (req.user && req.user._id) {
            const products = await Product.find({ user: req.user._id }).select('name');
            productNames = products.map(p => p.name);
        }
        
        const today = new Date().toISOString().split('T')[0];

        // Parse with GPT to extract fields
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `Hoje é ${today}. Você é um assistente que extrai informações de vendas de um texto.
                    
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
                    3. Se faltar algo, omita o campo.` 
                },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });

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

        // Determinar cenário e buscar estratégias
        let scenario = 'below_break_even';
        let goalText = `Faltam faturar: ${faltamFormatted} para atingir o ponto de equilíbrio.`;
        let systemRole = "Você é um consultor especialista em recuperação financeira e vendas para confeitarias.";
        
        if (faltam <= 0) {
            scenario = 'above_break_even';
            goalText = `A meta foi atingida! O faturamento atual é ${vendasFormatted} (acima da meta de ${metaFormatted}). O objetivo agora é lucrar mais e crescer.`;
            systemRole = "Você é um consultor especialista em expansão de negócios e gestão de lucros para confeitarias.";
        }

        // Buscar estratégias no "Mini-DB"
        let strategies = [];
        try {
            strategies = await FinancialStrategy.find({ scenario });
        } catch (dbError) {
            console.error('Erro ao buscar estratégias (DB):', dbError);
            // Fallback will handle empty strategies
        }
        
        // Buscar produtos do usuário para contexto
        let userProducts = [];
        try {
            // Check if user is authenticated before accessing req.user
            if (req.user && req.user.id) {
                userProducts = await Product.find({ user: req.user.id }).limit(5);
            }
        } catch (err) {
            console.warn('Erro ao buscar produtos para dica:', err.message);
        }
        
        const productsText = userProducts.length > 0 
            ? userProducts.map(p => {
                const custo = p.totalCost !== undefined && p.totalCost !== null ? Number(p.totalCost) : 0;
                const preco = p.sellingPrice !== undefined && p.sellingPrice !== null ? Number(p.sellingPrice) : 0;
                return `${p.name} (Custo: R$${custo.toFixed(2)}, Preço: R$${preco.toFixed(2)})`;
            }).join(', ')
            : 'Nenhum produto cadastrado ainda.';

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
            - Produtos Principais Cadastrados: ${productsText}
            
            Base de Conhecimento (Estratégias Recomendadas para este cenário):
            ${strategiesText}
            
            Ação:
            Com base no contexto e usando a Base de Conhecimento como inspiração, dê uma dica curta, prática e valiosa (máximo 2 parágrafos).
            
            IMPORTANTE - Contexto do Público:
            - O público são confeiteiras que vendem principalmente por WhatsApp, Instagram (Direct/Stories) e boca a boca.
            - O "checkout" muitas vezes é manual (conversa no WhatsApp). NÃO use termos como "upsell no checkout" ou "carrinho de compras".
            - Sugira estratégias de vendas conversacionais ou promoções manuais (ex: "Ofereça no WhatsApp", "Poste no Instagram").
            - Se houver produtos cadastrados, TENTE mencionar uma estratégia específica usando um dos produtos (ex: "Faça uma promoção com o [Nome do Produto]").
            
            ${scenario === 'below_break_even' 
                ? 'Foque em ações rápidas para gerar caixa imediato.' 
                : 'Foque em reinvestimento, reserva de emergência ou fidelização.'}
            
            Seja amigável, direto e use emojis.
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
        const offerName = (
            payloadData.offer?.name || 
            ''
        ).toUpperCase();
        
        const productName = (
            payloadData.product?.name || 
            ''
        ).toUpperCase();

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
        const keywords = ['COMPLETO', 'UPGRADE', 'VITALÍCIO', 'LIFETIME', 'PREMIUM'];
        if (keywords.some(k => combinedName.includes(k))) {
            planType = 'complete';
        }
        console.log(`📋 [WEBHOOK] Plan determined: ${planType} (Source: ${combinedName})`);

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
                subscriptionType: 'paid',
                subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year access
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
            user.subscriptionType = 'paid';
            user.subscriptionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            
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
