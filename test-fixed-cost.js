
const fixedCosts = [
    {
        name: "Aluguel",
        amount: 1000,
        recurrenceType: "monthly",
        date: "2024-01-05T00:00:00.000Z", // Due on the 5th
        installments: 1
    },
    {
        name: "Parcela Carro",
        amount: 500,
        recurrenceType: "installment",
        date: "2024-01-10T00:00:00.000Z", // Due on the 10th
        installments: 12
    }
];

function calculateFixedCost(sDate, eDate) {
    let totalFixedCost = 0;
    const loopStart = new Date(sDate);
    const loopEnd = new Date(eDate);

    console.log(`Looping from ${loopStart.toISOString()} to ${loopEnd.toISOString()}`);

    for (let d = new Date(loopStart); d <= loopEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        const currentDay = d.getUTCDate();
        const currentMonth = d.getUTCMonth();
        const currentYear = d.getUTCFullYear();
        
        // console.log(`Checking ${d.toISOString()} (Day: ${currentDay})`);

        fixedCosts.forEach(cost => {
            if (!cost.date) return;
            const costDate = new Date(cost.date);
            
            const isSameMonth = d.getUTCMonth() === costDate.getUTCMonth() && d.getUTCFullYear() === costDate.getUTCFullYear();
            // This check seems to prevent past costs from being counted if we look at past dates?
            // "if (d < costDate && !isSameMonth) return;"
            // If d is Feb 1st 2024. costDate is Jan 5th 2024.
            // d > costDate. So this check passes.
            // If d is Jan 1st 2024. costDate is Jan 5th 2024.
            // d < costDate. Same month? Yes. Passes.
            // If d is Jan 1st 2023. costDate is Jan 5th 2024.
            // d < costDate. Same month? No. Returns. Correct.
            if (d < costDate && !isSameMonth) return;

            let dueDay = costDate.getUTCDate();
            const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
            if (dueDay > daysInMonth) dueDay = daysInMonth;
            
            if (currentDay === dueDay) {
                if (cost.recurrenceType === 'monthly') {
                    console.log(`Found Monthly Cost: ${cost.name} on ${d.toISOString()}`);
                    totalFixedCost += cost.amount;
                } else if (cost.recurrenceType === 'installment') {
                    const monthsDiff = (currentYear - costDate.getUTCFullYear()) * 12 + (currentMonth - costDate.getUTCMonth());
                    if (monthsDiff >= 0 && monthsDiff < cost.installments) {
                        console.log(`Found Installment Cost: ${cost.name} on ${d.toISOString()} (Month ${monthsDiff+1}/${cost.installments})`);
                        totalFixedCost += cost.amount;
                    }
                }
            }
        });
    }
    return totalFixedCost;
}

// Simulate "This Month" (Feb 2024)
// Start: Feb 1st 2024 00:00:00 Local -> UTC depends on offset.
// Let's assume input is ISO strings as they come from frontend.
// Frontend: new Date(y, m, 1) setHours(0,0,0,0) -> ISO
// If UTC-3: Feb 1st 00:00 -> Feb 1st 03:00 UTC
const start = "2024-02-01T03:00:00.000Z";
const end = "2024-02-29T23:59:59.999Z"; // Leap year 2024

const total = calculateFixedCost(start, end);
console.log(`Total Fixed Cost: ${total}`);
