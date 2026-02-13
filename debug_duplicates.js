
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkDuplicates() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const email = "simulacao@bellecake.com";
        console.log(`🔍 Searching for ALL users with email: ${email}`);

        const users = await User.find({ email: email });
        console.log(`Found ${users.length} users.`);

        users.forEach((u, index) => {
            console.log(`--- User ${index + 1} ---`);
            console.log(`ID: ${u._id}`);
            console.log(`Name: ${u.name}`);
            console.log(`BreakEvenPoint: ${u.breakEvenPoint}`);
            console.log(`Has BreakEven? ${!!u.breakEvenPoint}`);
            console.log('----------------');
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ Error:', err);
    }
}

checkDuplicates();
