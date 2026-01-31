const mongoose = require('mongoose');
const FixedCost = require('./models/FixedCost');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to DB");

        const costs = await FixedCost.find({});
        console.log(`Found ${costs.length} costs`);
        
        const now = new Date(); // 2026-01-30
        console.log("Current Date (Simulated):", now.toISOString());
        
        const start = new Date(now.getFullYear(), now.getMonth(), 1); // 2026-01-01
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 2026-01-31
        
        console.log(`Simulating Period: ${start.toISOString()} to ${end.toISOString()}`);

        let totalFixedCost = 0;
        
        // Simulation Logic from server.js
        const loopStart = new Date(start);
        const loopEnd = new Date(end);
        
        for (let d = new Date(loopStart); d <= loopEnd; d.setUTCDate(d.getUTCDate() + 1)) {
            const currentDay = d.getUTCDate();
            const currentMonth = d.getUTCMonth();
            const currentYear = d.getUTCFullYear();
            
            costs.forEach(cost => {
                if (!cost.date) return;
                const costDate = new Date(cost.date);
                if (isNaN(costDate)) return;
                
                const isSameMonth = d.getUTCMonth() === costDate.getUTCMonth() && d.getUTCFullYear() === costDate.getUTCFullYear();
                if (d < costDate && !isSameMonth) return;

                let dueDay = costDate.getUTCDate();
                const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
                if (dueDay > daysInMonth) dueDay = daysInMonth;
                
                if (currentDay === dueDay) {
                    if (cost.recurrenceType === 'monthly') {
                        console.log(`[${d.toISOString().split('T')[0]}] Adding Monthly: ${cost.name} (${cost.amount})`);
                        totalFixedCost += cost.amount;
                    } else if (cost.recurrenceType === 'installment') {
                        const monthsDiff = (currentYear - costDate.getUTCFullYear()) * 12 + (currentMonth - costDate.getUTCMonth());
                        if (monthsDiff >= 0 && monthsDiff < cost.installments) {
                            console.log(`[${d.toISOString().split('T')[0]}] Adding Installment: ${cost.name} (${cost.amount})`);
                            totalFixedCost += cost.amount;
                        }
                    }
                }
            });
        }
        
        console.log("Total Fixed Cost:", totalFixedCost);
        
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
}

run();
