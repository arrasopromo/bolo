const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware for parsing JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
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
