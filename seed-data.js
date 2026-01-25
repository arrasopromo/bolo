const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Product = require('./models/Product');
const Sale = require('./models/Sale');
const FixedCost = require('./models/FixedCost');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const seedData = async () => {
    await connectDB();

    try {
        // 1. Create User
        const email = 'simulacao@bellecake.com';
        let user = await User.findOne({ email });
        
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        if (!user) {
            user = new User({
                name: 'Simulação User',
                email,
                token,
                plan: 'complete',
                status: 'active',
                subscriptionStatus: 'active'
            });
            await user.save();
            console.log('✅ User created');
        } else {
            user.token = token;
            await user.save();
            console.log('✅ User updated with new token');
        }

        console.log(`🔑 TOKEN: ${token}`);

        // 2. Clear existing data for this user
        await Product.deleteMany({ user: user._id });
        await Sale.deleteMany({ user: user._id });
        await FixedCost.deleteMany({ user: user._id });
        console.log('🧹 Old data cleared');

        // 3. Create Products
        const productsData = [
            { name: 'Bolo de Pote Ninho c/ Nutella', variableCost: 4.50, salePrice: 12.00 },
            { name: 'Bolo de Pote Morango', variableCost: 3.80, salePrice: 10.00 },
            { name: 'Brownie Recheado', variableCost: 2.50, salePrice: 8.00 },
            { name: 'Copo da Felicidade', variableCost: 6.00, salePrice: 18.00 },
            { name: 'Fatia de Bolo Cenoura', variableCost: 1.50, salePrice: 6.00 }
        ];

        const products = [];
        for (const p of productsData) {
            const product = new Product({ ...p, user: user._id });
            await product.save();
            products.push(product);
        }
        console.log(`✅ ${products.length} Products created`);

        // 4. Create Sales (Last 30 days)
        const salesCount = 50;
        const now = new Date();
        
        for (let i = 0; i < salesCount; i++) {
            const randomProduct = products[Math.floor(Math.random() * products.length)];
            const randomDaysAgo = Math.floor(Math.random() * 30);
            const date = new Date(now);
            date.setDate(date.getDate() - randomDaysAgo);
            // Random hour between 8 and 20
            date.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));

            const quantity = Math.floor(Math.random() * 3) + 1; // 1 to 3
            const totalAmount = randomProduct.salePrice * quantity;
            const totalCost = randomProduct.variableCost * quantity;
            const profit = totalAmount - totalCost;

            const sale = new Sale({
                product: randomProduct._id,
                quantity,
                totalAmount,
                totalCost,
                profit,
                paymentMethod: ['pix', 'credit', 'cash'][Math.floor(Math.random() * 3)],
                date,
                user: user._id
            });
            await sale.save();
        }
        console.log(`✅ ${salesCount} Sales created`);

        // 5. Create Fixed Costs
        const costsData = [
            { name: 'Energia Elétrica', amount: 150.00, recurrenceType: 'monthly' },
            { name: 'Internet', amount: 99.90, recurrenceType: 'monthly' },
            { name: 'Embalagens (Parcela)', amount: 200.00, recurrenceType: 'installment', installments: 3 }
        ];

        for (const c of costsData) {
            const cost = new FixedCost({
                ...c,
                date: new Date(now.getFullYear(), now.getMonth(), 5), // 5th of current month
                user: user._id
            });
            await cost.save();
        }
        console.log(`✅ Fixed Costs created`);

        console.log('------------------------------------------------');
        console.log(`🚀 SIMULATION COMPLETE`);
        console.log(`👉 Use this token in URL: /fluxo?token=${token}`);
        console.log('------------------------------------------------');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
