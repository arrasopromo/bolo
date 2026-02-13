// const fetch = require('node-fetch'); // Native fetch is available in Node.js 18+

async function testWebhookPaid() {
    const url = 'http://localhost:4000/api/webhook/cakto';
    
    // Simulating a "PAID" event (Pix Confirmado or Credit Card)
    const payload = {
        event: 'payment_approved', 
        status: 'paid', // THIS IS THE KEY FIELD FOR PRODUCTION
        customer: {
            name: 'Teste Pagamento Aprovado',
            email: 'cliente.pago@teste.com',
            full_name: 'Cliente Pagador da Silva'
        },
        product: {
            name: 'Acesso Completo BelleCake'
        },
        amount: 97.00
    };

    console.log('🚀 Enviando Webhook simulado de PAGAMENTO CONFIRMADO (PAID) para:', url);
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log('------------------------------------------------');
        console.log('📡 Status:', response.status);
        
        try {
            const data = JSON.parse(text);
            console.log('📩 Resposta JSON:', data);
            console.log('✅ Se o servidor imprimiu "Email de acesso enviado...", o teste foi um sucesso!');
        } catch (e) {
            console.log('📩 Resposta Texto:', text);
        }

    } catch (error) {
        console.error('❌ Erro na requisição:', error);
    }
}

testWebhookPaid();