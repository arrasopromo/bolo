const axios = require('axios');

// Payload fornecido pelo usuário (Cakto Pix Gerado - Vitalício)
const payload = { 
   "data": [ 
     { 
       "id": "bdc1a592-c107-4de2-a16f-21f1ef1a71d0", 
       "fbc": "fb.2.1770658691167.PAaWdyZAP2-s1leHRuA2FlbQEwAGFkaWQBqyakLICkxXNydGMGYXBwX2lkDDI1NjI4MTA0MDU1OAABp3da7rw0a4MW7S2jPKAHjXD3tkizV2uFgJ5Bx3HRkoQzZtPZI9gOeoxKl6xm_aem_qV5dFzh38uELRG7u6CZhTQ", 
       "fbp": "fb.2.1768766916186.13031854220384725", 
       "pix": { 
         "qrCode": "00020126810014br.gov.bcb.pix2559qr-code.picpay.com/pix/6b23046f-a354-474d-a29d-5bcc5933b7905204000053039865802BR5914CAKTO PAY LTDA6009BALNEARIO62070503***63045FF5", 
         "user_journey": null, 
         "expirationDate": "2026-02-09 22:44:09.512190+00:00" 
       }, 
       "sck": null, 
       "fees": 2.49, 
       "offer": { 
         "id": "9gh3y82", 
         "name": "FLUXO DE CAIXA", 
         "image": null, 
         "price": 127, 
         "currency": "BRL" 
       }, 
       "refId": "4SgGVBB", 
       "amount": 127.99, 
       "paidAt": null, 
       "reason": null, 
       "status": "waiting_payment", 
       "address": null, 
       "product": { 
         "id": "2391dcc0-400a-481a-b909-be564cd25a5a", 
         "name": "FLUXO DE CAIXA - ACESSO VITALÍCIO", 
         "type": "unique", 
         "short_id": "8dgkLGq", 
         "supportEmail": "suportebellecake@gmail.com", 
         "invoiceDescription": "" 
       }, 
       "checkout": 753500, 
       "customer": { 
         "name": "Raynan Rainer Ferreira de Almeida", 
         "email": "simulacao@bellecake.com", 
         "phone": "5531975938916", 
         "docType": "cpf", 
         "birthDate": null, 
         "docNumber": "13076453645" 
       }, 
       "discount": "0.00", 
       "due_date": null, 
       "shipping": null, 
       "utm_term": null, 
       "affiliate": "", 
       "createdAt": "2026-02-09T18:44:06.596836-03:00", 
       "baseAmount": 127, 
       "canceledAt": null, 
       "couponCode": null, 
       "offer_type": "main", 
       "refundedAt": null, 
       "utm_medium": null, 
       "utm_source": null, 
       "checkoutUrl": " https://pay.cakto.com.br/9gh3y82_753500?email=simulacao%40bellecake.com ", 
       "commissions": [ 
         { 
           "type": "producer", 
           "user": "arraso.promo@gmail.com", 
           "percentage": 100, 
           "totalAmount": 124.51 
         } 
       ], 
       "utm_content": null, 
       "installments": 1, 
       "parent_order": "", 
       "subscription": null, 
       "utm_campaign": null, 
       "chargedbackAt": null, 
       "paymentMethod": "pix", 
       "refund_reason": null, 
       "paymentMethodName": "PIX", 
       "subscription_period": null, 
       "additionalInstallmentInterest": "0.00" 
     } 
   ], 
   "event": "pix_gerado", 
   "secret": "40e94209-8557-4955-b9f4-eadb131ca54e" 
 };

async function sendWebhook() {
    try {
        console.log('🚀 Sending Webhook Simulation (VITALICIO - PIX GERADO)...');
        const response = await axios.post('http://localhost:4000/api/webhook/cakto', payload);
        console.log('✅ Response:', response.data);
    } catch (error) {
        console.error('❌ Error:', error.response ? error.response.data : error.message);
    }
}

sendWebhook();
