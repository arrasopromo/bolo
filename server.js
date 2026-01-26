require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const connectDB = require('./config/db');
const User = require('./models/User');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const FixedCost = require('./models/FixedCost');

const app = express();
const PORT = process.env.PORT || 4000;

// Connect to Database
connectDB();

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware for parsing JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Authentication Middleware
const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers['authorization'] || req.query.token;
        if (!token) {
            // Allow public access to webhook and static files, but API needs token
            // If it's a webhook request, skip auth
            if (req.path.startsWith('/api/webhook')) return next();
            // If it's a static file request (view), we might handle it differently or client-side redirect
            // For API requests:
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Token de acesso não fornecido.' });
            }
            return next();
        }
        
        // Remove 'Bearer ' if present
        const cleanToken = token.replace('Bearer ', '');
        
        const user = await User.findOne({ token: cleanToken });
        if (!user) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Token inválido.' });
            }
            return next();
        }
        
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth error:', err);
        res.status(500).json({ error: 'Erro na autenticação' });
    }
};

app.use(authenticateUser);

// --- Webhook Endpoint (Moved to top for priority) ---
app.post('/api/webhook/cakto', async (req, res) => {
    console.log('🪝 WEBHOOK CAKTO RECEBIDO');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('------------------------------------------------');

    try {
        // Normalização dos dados (tentativa de capturar vários formatos possíveis)
        const payload = req.body;
        
        // Mapeamento de campos (ajuste conforme o payload real da Cakto)
        // Geralmente: status, customer (name, email), product (name, id)
        const status = payload.status || payload.current_status || payload.event || '';
        const email = payload.email || payload.customer?.email || payload.client_email || '';
        const name = payload.name || payload.customer?.name || payload.client_name || payload.customer?.full_name || 'Cliente';
        const productName = payload.product_name || payload.product?.name || '';
        
        console.log(`Processando: Email=${email}, Status=${status}, Produto=${productName}`);

        // Validar se é uma compra aprovada/paga
        // Aceita 'paid', 'approved', 'completed', etc.
        // Adicionado 'pix', 'generated', 'pending', 'waiting', 'created', 'billing' para testes conforme solicitado
        const paidKeywords = ['paid', 'approved', 'completed', 'authorized', 'pix', 'generated', 'pending', 'waiting', 'created', 'billing'];
        const isPaid = paidKeywords.some(s => status.toLowerCase().includes(s));
        
        if (!isPaid) {
            console.log('⚠️ Ignorando webhook: Status não é de pagamento aprovado ou pendente de teste.');
            return res.status(200).json({ message: 'Ignored: Not a paid status' });
        }

        if (!email) {
            console.error('❌ Erro: Email não encontrado no payload.');
            return res.status(400).json({ error: 'Email missing' });
        }

        // Determinar Plano com base no nome do produto
        // Ajuste essas strings conforme o nome real do seu produto na Cakto
        let plan = 'basic';
        if (productName.toLowerCase().includes('completo') || 
            productName.toLowerCase().includes('premium') || 
            productName.toLowerCase().includes('vitalício') ||
            productName.toLowerCase().includes('combo')) {
            plan = 'complete';
        }

        // Check if user exists
        let user = await User.findOne({ email });
        
        if (!user) {
            console.log('🆕 Criando novo usuário...');
            // Create new user with token
            const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            
            // Calculate subscription expiration (1 month free for complete plan logic removed/adjusted as per request for lifetime access in pricing, 
            // but keeping logic for "assinatura por 1 mes gratuita" from previous prompt if needed, 
            // THOUGH user said "acesso vitalicio" in pricing just now. 
            // Let's set status active.
            
            let subscriptionExpiresAt = null;
            let subscriptionStatus = 'active'; // Acesso vitalício por padrão se pagou

            // Se for recorrência (fluxo de caixa separado), ajustar aqui. 
            // Por enquanto, acesso vitalício à planilha.
            
            user = new User({
                name,
                email,
                plan, // basic, complete
                token,
                status: 'active',
                subscriptionStatus,
                subscriptionExpiresAt
            });
            await user.save();
            console.log(`✅ Usuário criado com sucesso: ${email} | Token: ${token}`);
        } else {
            console.log('🔄 Atualizando usuário existente...');
            // Update existing user
            user.plan = plan === 'complete' ? 'complete' : user.plan; // Upgrade if new plan is complete
            user.status = 'active';
            user.subscriptionStatus = 'active';
            
            await user.save();
            console.log(`✅ Usuário atualizado: ${email}`);
        }
        
        res.status(200).json({ message: 'Webhook processed successfully', user_token: user.token });
    } catch (err) {
        console.error('❌ Webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Serve the Presentation page
app.get('/apresentacao', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'apresentacao.html'));
});

// Serve the Break-even Calculator page
app.get('/equilibrio', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'equilibrio.html'));
});

// Serve the Members Area page
app.get('/membros', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'membros.html'));
});

// Serve the Cash Flow (Fluxo) page
app.get('/fluxo', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'fluxo.html'));
});

// --- Dev Login Route (Localhost Support) ---
app.get('/dev-login', async (req, res) => {
    try {
        const email = 'admin@bellecake.com';
        let user = await User.findOne({ email });
        
        if (!user) {
            user = new User({
                name: 'Admin Teste',
                email,
                plan: 'complete',
                token: 'dev-token-' + Date.now(),
                status: 'active',
                subscriptionStatus: 'active'
            });
            await user.save();
        }
        
        res.redirect(`/membros?token=${user.token}`);
    } catch (err) {
        console.error('Erro no login de dev:', err);
        res.status(500).send('Erro ao criar usuário de teste');
    }
});

// Get current user info
app.get('/api/user/me', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        res.json({
            name: req.user.name,
            email: req.user.email,
            plan: req.user.plan
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
    }
});

const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// --- Voice Transcription Route ---
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        // 1. Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: "whisper-1",
            language: "pt",
        });

        const text = transcription.text;
        
        // 2. Parse intent with GPT
        // We need products to match names
        const products = await Product.find({ user: req.user._id }).select('name');
        const productNames = products.map(p => p.name).join(', ');

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `You are a sales assistant. Extract data from the text. 
                Available products: ${productNames}. 
                Return JSON only: { "productName": string (match exactly one from list if possible, else null), "quantity": number, "paymentMethod": string (pix, credit, debit, cash), "date": string (YYYY-MM-DD) }. 
                Default date to today if not specified. Default quantity to 1.` },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });

        const parsedData = JSON.parse(completion.choices[0].message.content);

        // Cleanup file
        fs.unlinkSync(req.file.path);

        res.json({ text, parsedData });

    } catch (err) {
        console.error('Transcription error:', err);
        res.status(500).json({ error: 'Erro na transcrição' });
    }
});

// --- API Routes for Fluxo ---

// Get all products for a user
app.get('/api/products', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const products = await Product.find({ user: req.user._id }).sort({ name: 1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

// Create a new product
app.post('/api/products', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { name, variableCost, salePrice } = req.body;
        const newProduct = new Product({
            name,
            variableCost,
            salePrice,
            user: req.user._id
        });
        await newProduct.save();
        res.json(newProduct);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
});

// Update a product
app.put('/api/products/:id', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { name, variableCost, salePrice } = req.body;
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { name, variableCost, salePrice },
            { new: true }
        );
        if (!updatedProduct) return res.status(404).json({ error: 'Produto não encontrado' });
        res.json(updatedProduct);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const deletedProduct = await Product.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!deletedProduct) return res.status(404).json({ error: 'Produto não encontrado' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao remover produto' });
    }
});

// Get sales with filters
app.get('/api/sales', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { period } = req.query; // today, yesterday, 7days, 30days, lastmonth
        let query = { user: req.user._id };
        const now = new Date();
        
        if (period === 'today') {
            const start = new Date(now.setHours(0,0,0,0));
            const end = new Date(now.setHours(23,59,59,999));
            query.date = { $gte: start, $lte: end };
        } else if (period === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const start = new Date(yesterday.setHours(0,0,0,0));
            const end = new Date(yesterday.setHours(23,59,59,999));
            query.date = { $gte: start, $lte: end };
        } else if (period === '7days') {
            const start = new Date(now);
            start.setDate(start.getDate() - 7);
            query.date = { $gte: start };
        } else if (period === '30days') {
            const start = new Date(now);
            start.setDate(start.getDate() - 30);
            query.date = { $gte: start };
        } else if (period === 'all') {
            // No date filter
        }
        
        const sales = await Sale.find(query).populate('product').sort({ date: -1 });
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar vendas' });
    }
});

// Register a sale
app.post('/api/sales', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { productId, quantity, date, paymentMethod } = req.body;
        const product = await Product.findOne({ _id: productId, user: req.user._id });
        
        if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
        
        const totalAmount = product.salePrice * quantity;
        const totalCost = product.variableCost * quantity;
        const profit = totalAmount - totalCost;
        
        const newSale = new Sale({
            product: productId,
            quantity,
            totalAmount,
            totalCost,
            profit,
            paymentMethod: paymentMethod || 'pix',
            date: date || new Date(),
            user: req.user._id
        });
        
        await newSale.save();
        res.json(newSale);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao registrar venda' });
    }
});

// --- Fixed Costs Routes ---

app.get('/api/fixed-costs', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { period } = req.query;
        let start, end;
        const now = new Date();

        if (period === 'this_month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else {
             start = new Date(now.getFullYear(), now.getMonth(), 1);
             end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        }
        
        const costs = await FixedCost.find({ date: { $lte: end }, user: req.user._id }).sort({ date: -1 });
        
        const activeCosts = costs.map(cost => {
             const costDate = new Date(cost.date);
             // Calculate how many months have passed since start until the query start month
             const monthsDiff = (start.getFullYear() - costDate.getFullYear()) * 12 + (start.getMonth() - costDate.getMonth());
             
             if (cost.recurrenceType === 'monthly') return cost;
             if (cost.recurrenceType === 'installment') {
                 if (monthsDiff >= 0 && monthsDiff < cost.installments) {
                     const costObj = cost.toObject();
                     costObj.name = `${costObj.name} (${monthsDiff + 1}/${cost.installments})`;
                     return costObj;
                 }
             }
             return null;
        }).filter(c => c !== null);

        res.json(activeCosts);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar custos fixos' });
    }
});

app.post('/api/fixed-costs', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { name, amount, date, recurrenceType, installments } = req.body;
        const newCost = new FixedCost({
            name,
            amount,
            date: date || new Date(),
            recurrenceType: recurrenceType || 'monthly',
            installments: installments || 1,
            user: req.user._id
        });
        await newCost.save();
        res.json(newCost);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar custo fixo' });
    }
});

app.put('/api/fixed-costs/:id', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { name, amount, date, recurrenceType, installments } = req.body;
        const updatedCost = await FixedCost.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { name, amount, date, recurrenceType, installments },
            { new: true }
        );
        if (!updatedCost) return res.status(404).json({ error: 'Custo não encontrado' });
        res.json(updatedCost);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar custo fixo' });
    }
});

app.delete('/api/fixed-costs/:id', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        await FixedCost.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao remover custo fixo' });
    }
});

// --- Dashboard Stats Route ---
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { period } = req.query; // today, yesterday, 7days, 30days
        const now = new Date();
        let start, end;

        // Determine date range
        if (period === 'today') {
            start = new Date(now.setHours(0,0,0,0));
            end = new Date(now.setHours(23,59,59,999));
        } else if (period === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            start = new Date(yesterday.setHours(0,0,0,0));
            end = new Date(yesterday.setHours(23,59,59,999));
        } else if (period === '7days') {
            start = new Date(now);
            start.setDate(start.getDate() - 7);
            end = new Date();
        } else if (period === '30days') {
            start = new Date(now);
            start.setDate(start.getDate() - 30);
            end = new Date();
        } else {
            // Default to 30 days
            start = new Date(now);
            start.setDate(start.getDate() - 30);
            end = new Date();
        }

        const dateQuery = { date: { $gte: start, $lte: end }, user: req.user._id };

        // Fetch Sales
        const sales = await Sale.find(dateQuery).populate('product');
        
        // Fetch Fixed Costs (Handle recurrence)
        const allFixedCosts = await FixedCost.find({ user: req.user._id });
        let totalFixedCost = 0;

        // Helper to check if a date is in range
        const isDateInRange = (d, s, e) => d >= s && d <= e;

        // Calculate fixed costs for the period
        // We iterate through each day of the period (or check overlap logic)
        // Since we need an aggregate sum, we can sum up applicable costs for the period.
        
        // Strategy: 
        // For 'monthly': If the cost start date is before or within the period, 
        // and the recurrence day falls within the period, add it.
        // For 'installment': Same, but check if within installment limit.
        
        // Simpler approach for "Period View":
        // Iterate through every day in the query range.
        // For each day, check which costs are "due".
        
        const loopStart = new Date(start);
        const loopEnd = new Date(end);
        
        for (let d = new Date(loopStart); d <= loopEnd; d.setDate(d.getDate() + 1)) {
            const currentDay = d.getDate();
            const currentMonth = d.getMonth();
            const currentYear = d.getFullYear();
            
            allFixedCosts.forEach(cost => {
                const costDate = new Date(cost.date);
                const costStartDay = costDate.getDate();
                
                // Check if cost is active (started before or on this day)
                if (d < costDate) return;

                // Check if it's the "due day" (simplified: same day of month)
                // Handle edge case: if costStartDay > days in current month (e.g., 31st in Feb), use last day?
                // For simplicity, strict day matching or 28th for >28.
                let dueDay = costStartDay;
                const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                if (dueDay > daysInMonth) dueDay = daysInMonth;
                
                if (currentDay === dueDay) {
                     if (cost.recurrenceType === 'monthly') {
                         totalFixedCost += cost.amount;
                     } else if (cost.recurrenceType === 'installment') {
                         // Check if within installment count
                         // Calculate months difference correctly
                         const monthsDiff = (currentYear - costDate.getFullYear()) * 12 + (currentMonth - costDate.getMonth());
                         if (monthsDiff >= 0 && monthsDiff < cost.installments) {
                             totalFixedCost += cost.amount;
                         }
                     }
                 }
             });
         }

        // Aggregations
        let totalRevenue = 0;
        let totalVariableCost = 0;
        let totalSalesCount = sales.length;
        let salesByMethod = { pix: 0, credit: 0, debit: 0, cash: 0 };
        let salesByDay = {}; // { "YYYY-MM-DD": { revenue: 0, count: 0 } }
        let productStats = {};

        sales.forEach(sale => {
            totalRevenue += sale.totalAmount;
            totalVariableCost += sale.totalCost;
            
            // Payment Method
            const method = sale.paymentMethod || 'pix';
            if (salesByMethod[method] !== undefined) {
                salesByMethod[method]++;
            }

            // Daily Stats
            const dayKey = new Date(sale.date).toISOString().split('T')[0];
            if (!salesByDay[dayKey]) {
                salesByDay[dayKey] = { revenue: 0, count: 0 };
            }
            salesByDay[dayKey].revenue += sale.totalAmount;
            salesByDay[dayKey].count += 1;

            // Product Aggregation
            if (sale.product) {
                const pId = sale.product._id.toString();
                const pName = sale.product.name;
                if (!productStats[pId]) {
                    productStats[pId] = { name: pName, quantity: 0, revenue: 0 };
                }
                productStats[pId].quantity += sale.quantity;
                productStats[pId].revenue += sale.totalAmount;
            }
        });
        
        const topProducts = Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const grossProfit = totalRevenue - totalVariableCost;
        const netProfit = grossProfit - totalFixedCost;
        const ticketAverage = totalSalesCount > 0 ? (totalRevenue / totalSalesCount) : 0;

        // Prepare Chart Data
        const sortedDays = Object.keys(salesByDay).sort();
        const chartLabels = sortedDays.map(day => {
            const [y, m, d] = day.split('-');
            return `${d}/${m}`;
        });
        const chartRevenueData = sortedDays.map(day => salesByDay[day].revenue);
        const chartTicketData = sortedDays.map(day => {
            const dayStats = salesByDay[day];
            return dayStats.count > 0 ? (dayStats.revenue / dayStats.count) : 0;
        });

        res.json({
            summary: {
                totalRevenue,
                totalVariableCost,
                totalFixedCost,
                totalCost: totalVariableCost + totalFixedCost,
                netProfit,
                ticketAverage,
                salesCount: totalSalesCount,
                salesByMethod, // { pix: 5, credit: 2 ... }
                topProducts
            },
            charts: {
                labels: chartLabels,
                revenue: chartRevenueData,
                ticket: chartTicketData
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao gerar estatísticas' });
    }
});

// --- Webhook Endpoint ---
// MOVED TO TOP OF FILE
// app.post('/api/webhook/cakto', async (req, res) => { ... })

// API endpoint for sales tips (OpenAI integration)
app.post('/api/dicas-vendas', async (req, res) => {
    console.log('Recebendo requisição em /api/dicas-vendas');
    console.log('Body:', req.body);
    try {
        const { metaFaturamento, vendasAtuais } = req.body;
        
        if (metaFaturamento === undefined || vendasAtuais === undefined) {
            console.error('Dados incompletos');
            return res.status(400).json({ success: false, message: 'Dados incompletos.' });
        }

        const faltam = metaFaturamento - vendasAtuais;
        const hoje = new Date();
        const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        const diasRestantes = ultimoDiaMes.getDate() - hoje.getDate();
        
        // Formatar valores para BRL
        const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        const metaFormatted = formatter.format(metaFaturamento);
        const vendasFormatted = formatter.format(vendasAtuais);
        const faltamFormatted = formatter.format(faltam);

        // Se já bateu a meta
        if (faltam <= 0) {
            return res.json({
                success: true,
                message: "Parabéns! Você já atingiu (ou superou) seu ponto de equilíbrio este mês! 🎉 Todo valor que entrar agora gera lucro. Continue assim!"
            });
        }

        // Se ainda faltam vendas
        const prompt = `
            Você é um consultor especialista em confeitaria e vendas de bolos e doces.
            
            Contexto do usuário:
            - Meta de Faturamento (Ponto de Equilíbrio): ${metaFormatted} por mês.
            - Vendas realizadas até hoje (dia ${hoje.getDate()}): ${vendasFormatted}.
            - Faltam faturar: ${faltamFormatted}.
            - Dias restantes no mês: ${diasRestantes} dias.
            
            Ação:
            Dê uma dica curta, prática e motivacional (máximo 2 parágrafos) de como o usuário pode conseguir faturar esses ${faltamFormatted} restantes nos próximos ${diasRestantes} dias.
            Sugira uma ação rápida (ex: kit promocional, oferta de docinhos, contato com clientes antigos).
            Seja amigável e direto. Use emojis.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um assistente útil e motivador para confeiteiras empreendedoras." },
                { role: "user", content: prompt }
            ],
            max_tokens: 250,
        });

        const dica = completion.choices[0].message.content;

        res.json({
            success: true,
            message: dica
        });

    } catch (error) {
        console.error('Erro na API OpenAI:', error);
        res.status(500).json({ success: false, message: 'Erro ao gerar dica. Tente novamente.' });
    }
});

// API endpoint for cost classification
app.post('/api/classificar-custo', async (req, res) => {
    console.log('Recebendo requisição em /api/classificar-custo');
    const { item } = req.body;

    if (!item) {
        return res.status(400).json({ success: false, message: 'Item não fornecido.' });
    }

    try {
        const prompt = `
            Você é um especialista em contabilidade para confeitaria.
            Classifique o seguinte item como "Custo Fixo" ou "Custo Variável".
            Item: "${item}"
            
            Responda APENAS com o formato JSON:
            {
                "classificacao": "Custo Fixo" ou "Custo Variável",
                "explicacao": "Breve explicação de 1 frase do porquê."
            }
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é um assistente contábil preciso. Responda apenas JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 150,
        });

        const result = JSON.parse(completion.choices[0].message.content);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Erro na API OpenAI (Classificação):', error);
        res.status(500).json({ success: false, message: 'Erro ao classificar item.' });
    }
});

// API endpoint for contact form (redirects to WhatsApp)
app.post('/api/contact', (req, res) => {
    const { name, phone, message } = req.body;
    
    // Validate input
    if (!name || !phone) {
        return res.status(400).json({ success: false, message: 'Nome e telefone são obrigatórios.' });
    }

    // Format phone number (remove non-digits)
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Construct WhatsApp URL
    const text = `Olá, meu nome é ${name}. ${message || 'Gostaria de encomendar um bolo.'}`;
    const whatsappLink = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
    
    res.json({
        success: true,
        whatsappLink: whatsappLink
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
