const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

async function fixSubscriptionDate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bellecake');
        console.log('Connected to MongoDB');

        // Find all users
        const users = await User.find({});
        console.log(`Found ${users.length} users.`);

        for (const user of users) {
            // Check if date is missing
            if (!user.subscriptionExpiresAt) {
                console.log(`Updating user: ${user.email} - Missing Expiration Date`);
                
                // Set to 30 days from now
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 30);
                
                user.subscriptionExpiresAt = futureDate;
                user.subscriptionStatus = 'active'; // Ensure active
                user.subscriptionType = 'bonus'; // Default to bonus
                
                await user.save();
                console.log(`  -> Updated! New Expiration: ${futureDate.toISOString()}`);
            } else {
                console.log(`User ${user.email} already has expiration: ${user.subscriptionExpiresAt}`);
                // Optional: Force update if it looks wrong? 
                // Let's just update everyone to be safe for the demo
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 30);
                user.subscriptionExpiresAt = futureDate;
                user.subscriptionStatus = 'active';
                await user.save();
                console.log(`  -> Forced Update for demo: ${futureDate.toISOString()}`);
            }
        }

        console.log('Done.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixSubscriptionDate();
