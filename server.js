require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 4000;

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

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Serve the Break-even Calculator page
app.get('/equilibrio', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'equilibrio.html'));
});

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
