
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUser() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        const userId = "69758e8b5c211ad958fa0863"; // The ID provided by user
        console.log(`🔍 Searching for user with ID: ${userId}`);

        const user = await User.findById(userId);
        
        if (user) {
            console.log('✅ USER FOUND!');
            console.log('--- User Data Dump ---');
            console.log(`Name: ${user.name}`);
            console.log(`Email: ${user.email}`);
            console.log(`BreakEvenPoint (Raw):`, user.breakEvenPoint);
            console.log(`BreakEvenPoint (Type):`, typeof user.breakEvenPoint);
            console.log('----------------------');
        } else {
            console.log('❌ USER NOT FOUND with this ID.');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ Error:', err);
    }
}

checkUser();
