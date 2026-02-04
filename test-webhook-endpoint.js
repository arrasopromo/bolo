const http = require('http');

const payload = {
    event: "pix_gerado",
    data: {
        status: "waiting_payment",
        customer: {
            email: "teste.webhook.real@bellecake.com",
            name: "Teste Real Webhook"
        }
    }
};

const data = JSON.stringify(payload);

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/webhook/cakto',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('🚀 Sending simulated Cakto webhook...');
console.log('Target: http://localhost:4000/api/webhook/cakto');
console.log('Payload:', JSON.stringify(payload, null, 2));

const req = http.request(options, (res) => {
    console.log(`\n📡 Response Status: ${res.statusCode}`);
    
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('📦 Response Body:', body);
        if (res.statusCode === 200) {
            console.log('✅ Webhook accepted by server!');
        } else {
            console.log('❌ Webhook rejected/failed.');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Error sending request:', error.message);
    console.log('⚠️ Make sure your server is running on port 4000!');
});

req.write(data);
req.end();
