const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User'); // Ajuste o caminho se necessário

const uri = "mongodb://mongo:Rr12415721@69.62.99.94:27017/bellecake-fluxo?tls=false&authSource=admin";

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to MongoDB');
        try {
            const user = await User.findOne({ email: 'simulacao@bellecake.com' });
            if (user) {
                console.log('User found:', user.name);
                console.log('Plan:', user.plan);
                console.log('Subscription Status:', user.subscriptionStatus);
                console.log('Subscription Type:', user.subscriptionType);
                console.log('Subscription Expires At:', user.subscriptionExpiresAt);
            } else {
                console.log('User not found');
            }
        } catch (e) {
            console.error(e);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => console.error(err));
