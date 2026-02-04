const axios = require('axios');

// Simulate Cakto Webhook Payload (Basic Plan)
const payloadBasic = {
    data: [
        {
            status: "waiting_payment",
            pix: {
                qrCode: "00020126810014br.gov.bcb.pix...",
                expirationDate: "2026-02-04T21:34:02.444Z"
            },
            customer: {
                email: "teste.basic@bellecake.com",
                name: "Teste Basic Webhook"
            },
            amount: 20.88,
            offer: {
                id: "3aoidkh",
                name: "PLANILHA PRECIFICAÇÃO"
            }
        }
    ]
};

// Simulate Cakto Webhook Payload (Complete Plan)
const payloadComplete = {
    data: [
        {
            status: "paid",
            customer: {
                email: "teste.complete@bellecake.com",
                name: "Teste Complete Webhook"
            },
            offer: {
                id: "3aoidkh",
                name: "PLANILHA PRECIFICAÇÃO - ACESSO COMPLETO"
            }
        }
    ]
};

async function sendWebhook(payload, label) {
    try {
        console.log(`🚀 Sending Webhook Simulation (${label})...`);
        const response = await axios.post('http://localhost:4000/api/webhook/cakto', payload);
        console.log(`✅ Response (${label}):`, response.data);
    } catch (error) {
        console.error(`❌ Error (${label}):`, error.response ? error.response.data : error.message);
    }
}

async function runTests() {
    await sendWebhook(payloadBasic, 'BASIC PLAN');
    await sendWebhook(payloadComplete, 'COMPLETE PLAN');
}

runTests();