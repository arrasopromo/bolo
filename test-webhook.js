// const fetch = require('node-fetch'); // Native fetch is available in Node.js 18+

async function testWebhook() {
    const url = 'http://localhost:4000/api/webhook/cakto';
    
    // Simulating a "Pix Gerado" event from Cakto
    const payload = {
        event: 'pix_generated', // Status that we added for testing
        status: 'waiting_payment',
        customer: {
            name: 'Teste Cliente Pix',
            email: 'cliente.pix@teste.com',
            full_name: 'Teste Cliente Pix da Silva'
        },
        product: {
            name: 'Acesso Completo BelleCake'
        },
        amount: 97.00
    };

    console.log('🚀 Enviando Webhook simulado para:', url);
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
            
            if (data.user_token) {
                console.log('\n✅ SUCESSO! Token gerado:', data.user_token);
                console.log(`🔗 Link para teste: http://localhost:4000/membros?token=${data.user_token}`);
            } else {
                console.log('\n⚠️ Aviso: Nenhum token retornado (verifique os logs do servidor).');
            }
        } catch (e) {
            console.log('📩 Resposta Texto (Erro Parse):', text);
        }

    } catch (error) {
        console.error('❌ Erro ao enviar webhook:', error.message);
    }
}

testWebhook();
