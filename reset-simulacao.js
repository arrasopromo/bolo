const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User'); 

const uri = "mongodb://mongo:Rr12415721@69.62.99.94:27017/bellecake-fluxo?tls=false&authSource=admin";

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to MongoDB');
        try {
            const user = await User.findOne({ email: 'simulacao@bellecake.com' });
            if (user) {
                console.log('Resetting user:', user.name);
                
                // Reset to expired state on Feb 5, 2026
                user.plan = 'complete'; // Mantém o plano base, mas expira a assinatura
                user.subscriptionStatus = 'expired';
                user.subscriptionType = 'paid'; // Volta para pago (mensal) para sair do vitalício
                user.subscriptionExpiresAt = new Date('2026-02-05T12:00:00.000Z');
                
                await user.save();
                console.log('✅ User reset successfully to expired (2026-02-05)');
                console.log('New Status:', user.subscriptionStatus);
                console.log('New Expires:', user.subscriptionExpiresAt);
            } else {
                console.log('❌ User not found');
            }
        } catch (e) {
            console.error(e);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => console.error(err));
