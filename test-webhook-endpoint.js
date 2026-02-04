const http = require('http');

// Simulate Cakto Webhook Payload (Array Structure based on logs)
const payload = {
    data: [
        {
            status: "waiting_payment",
            pix: {
                qrCode: "00020126810014br.gov.bcb.pix...",
                expirationDate: "2026-02-04T21:34:02.444Z"
            },
            customer: {
                email: "teste.webhook.array@bellecake.com",
                name: "Teste Array Webhook"
            },
            amount: 20.88,
            offer: {
                id: "3aoidkh",
                name: "PLANILHA PRECIFICAÇÃO"
            }
        }
    ]
};

const data = JSON.stringify(payload);

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/webhook/cakto',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

console.log('🚀 Sending Webhook Simulation (Array Structure)...');
console.log('Target: http://localhost:4000/api/webhook/cakto');

const req = http.request(options, (res) => {
    console.log(`\n📡 Response Status: ${res.statusCode}`);
    
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('📦 Response Body:', body);
        if (res.statusCode === 200) {
            console.log('✅ Webhook accepted!');
        } else {
            console.log('❌ Webhook failed.');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request Error:', error.message);
});

req.write(data);
req.end();