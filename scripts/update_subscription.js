
const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const uri = "mongodb://mongo:Rr12415721@69.62.99.94:27017/bellecake-fluxo?tls=false&authSource=admin";

mongoose.connect(uri)
    .then(async () => {
        console.log('Connected to MongoDB');
        try {
            const user = await User.findOne({ email: 'simulacao@bellecake.com' });
            if (user) {
                console.log('User found:', user.name);
                console.log('Current Expiration:', user.subscriptionExpiresAt);
                console.log('Current Status:', user.subscriptionStatus);
                
                // Set to 2026-02-05
                user.subscriptionExpiresAt = new Date('2026-02-05T12:00:00.000Z');
                user.subscriptionStatus = 'expired'; // Force expired status for testing
                await user.save();
                console.log('User updated to expire on 2026-02-05');
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
