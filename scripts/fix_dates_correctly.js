const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' });

async function recalculateBonusExpiration() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bellecake');
        console.log('Connected to MongoDB');

        // Find users with 'bonus' subscription type
        // OR users who don't have a type yet (legacy) but are effectively bonus
        const users = await User.find({}); 
        console.log(`Found ${users.length} users to check.`);

        const now = new Date();

        for (const user of users) {
            // Only adjust if it's a BONUS plan (assuming paid ones have their own logic/dates set by webhook)
            // If subscriptionType is missing, assume bonus if plan is 'basic' or 'complete' without payment history? 
            // For now, let's rely on the fact that I just set them to 'bonus' in the previous script or they are new.
            
            // We want to enforce: ExpiresAt = CreatedAt + 30 Days
            if (user.subscriptionType === 'bonus' || !user.subscriptionType) {
                console.log(`Checking user: ${user.email} (Created: ${user.createdAt})`);
                
                const createdAt = new Date(user.createdAt);
                const correctExpiresAt = new Date(createdAt);
                correctExpiresAt.setDate(createdAt.getDate() + 30);
                
                // Update Expiration Date
                user.subscriptionExpiresAt = correctExpiresAt;
                user.subscriptionType = 'bonus'; // Ensure type is set

                // Check Status based on new date
                if (correctExpiresAt < now) {
                    user.subscriptionStatus = 'expired';
                    console.log(`  -> Status set to EXPIRED (Date was ${correctExpiresAt.toISOString()})`);
                } else {
                    user.subscriptionStatus = 'active';
                    console.log(`  -> Status set to ACTIVE (Expires ${correctExpiresAt.toISOString()})`);
                }

                await user.save();
            }
        }

        console.log('Recalculation Complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

recalculateBonusExpiration();
