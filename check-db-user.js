const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        const user = await User.findOne({ email: 'teste.webhook.array@bellecake.com' });
        if (user) {
            console.log('👤 User found:', user.email);
            console.log('   Status:', user.subscriptionStatus);
            console.log('   Plan:', user.plan);
            console.log('   Created At:', user.createdAt);
        } else {
            console.log('❌ User NOT found.');
        }
        mongoose.connection.close();
    })
    .catch(err => {
        console.error('❌ DB Error:', err);
        process.exit(1);
    });