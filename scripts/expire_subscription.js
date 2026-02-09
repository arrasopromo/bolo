const mongoose = require('mongoose');
const uri = "mongodb://mongo:Rr12415721@69.62.99.94:27017/bellecake-fluxo?tls=false&authSource=admin";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');
        const User = mongoose.connection.collection('users');
        
        // Set to 2026-02-05
        const newDate = new Date('2026-02-05T12:00:00.000Z');
        
        const result = await User.updateOne(
            { email: 'simulacao@bellecake.com' },
            { $set: { subscriptionExpiresAt: newDate } }
        );
        
        console.log('Update result:', result);
        
        // Verify
        const user = await User.findOne({ email: 'simulacao@bellecake.com' });
        console.log('Updated User:', user);
        
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
run();