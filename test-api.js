// const fetch = require('node-fetch'); // Native fetch is available in Node.js 18+

async function testApi() {
    const url = 'http://localhost:4000/api/sales';
    console.log('Testing POST', url);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: 'dummy', quantity: 1 })
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text.substring(0, 200));
    } catch (e) {
        console.error(e);
    }
}

testApi();
