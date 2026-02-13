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
        // 1. Create/Update User with SPECIFIC TOKEN
        const email = 'simulacao@bellecake.com';
        let user = await User.findOne({ email });
        
        // Use the token user is already using to avoid re-login issues
        const token = 'f4ihk566trr4tvmzg2dis'; 
        
        if (!user) {
            user = new User({
                name: 'Confeiteira de Sucesso',
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
            user.name = 'Confeiteira de Sucesso';
            await user.save();
            console.log('✅ User updated with FIXED token');
        }

        console.log(`🔑 TOKEN: ${token}`);

        // 2. Clear existing data for this user
        await Product.deleteMany({ user: user._id });
        await Sale.deleteMany({ user: user._id });
        await FixedCost.deleteMany({ user: user._id });
        console.log('🧹 Old data cleared');

        // 3. Create Diverse Products (Aro variations + Flavors)
        const sabores = ['Ninho c/ Nutella', 'Brigadeiro Belga', 'Morango do Nordeste', 'Abacaxi c/ Coco', 'Red Velvet', 'Cenoura Trufado', 'Limão Siciliano'];
        const tamanhos = [
            { aro: 'Aro 15', custo: 25.00, venda: 65.00 },
            { aro: 'Aro 20', custo: 45.00, venda: 120.00 },
            { aro: 'Aro 25', custo: 65.00, venda: 180.00 }
        ];
        const extras = [
            { name: 'Bolo de Pote', custo: 3.50, venda: 10.00 },
            { name: 'Cone Trufado', custo: 4.00, venda: 12.00 },
            { name: 'Docinho (Cento)', custo: 40.00, venda: 110.00 }
        ];

        const products = [];

        // Generate Cake Combinations
        for (const sabor of sabores) {
            for (const tam of tamanhos) {
                // Calculate roughly 25-30% variable cost
                // If sale price is 65, cost should be ~16-19
                // Current tam.custo for 65 is 25 (38%), which is high.
                
                const targetCost = tam.venda * (0.25 + (Math.random() * 0.05)); // 25-30%
                
                const product = new Product({
                    name: `Bolo ${sabor} - ${tam.aro}`,
                    variableCost: parseFloat(targetCost.toFixed(2)),
                    salePrice: tam.venda,
                    user: user._id
                });
                await product.save();
                products.push(product);
            }
        }

        // Add Extras (Also adjust to 25-30%)
        for (const ex of extras) {
            const targetCost = ex.venda * (0.25 + (Math.random() * 0.05));
            const product = new Product({
                name: ex.name,
                variableCost: parseFloat(targetCost.toFixed(2)),
                salePrice: ex.venda,
                user: user._id
            });
            await product.save();
            products.push(product);
        }

        console.log(`✅ ${products.length} Products created`);

        // 4. Create Sales (Last 60 days - Current Month + Previous)
        const salesCount = 120; // More sales
        const now = new Date();
        
        for (let i = 0; i < salesCount; i++) {
            const randomProduct = products[Math.floor(Math.random() * products.length)];
            
            // Random date within last 60 days
            const randomDaysAgo = Math.floor(Math.random() * 60);
            const date = new Date(now);
            date.setDate(date.getDate() - randomDaysAgo);
            // Random hour (business hours)
            date.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

            // Quantity (weighted towards 1)
            const r = Math.random();
            const quantity = r > 0.9 ? 3 : (r > 0.7 ? 2 : 1); 

            const totalAmount = randomProduct.salePrice * quantity;
            const totalCost = randomProduct.variableCost * quantity;
            const profit = totalAmount - totalCost;

            const sale = new Sale({
                product: randomProduct._id,
                quantity,
                totalAmount,
                totalCost,
                profit,
                paymentMethod: ['pix', 'pix', 'credit', 'credit', 'cash'][Math.floor(Math.random() * 5)], // Weighted
                date,
                user: user._id
            });
            await sale.save();
        }
        console.log(`✅ ${salesCount} Sales created`);

        // 5. Create Fixed Costs
        const costsData = [
            { name: 'Energia Elétrica', amount: 280.00, recurrenceType: 'monthly' },
            { name: 'Internet Fibra', amount: 109.90, recurrenceType: 'monthly' },
            { name: 'Aluguel do Ateliê', amount: 1200.00, recurrenceType: 'monthly' },
            { name: 'MEI', amount: 75.00, recurrenceType: 'monthly' },
            { name: 'Ajudante (Diárias)', amount: 600.00, recurrenceType: 'monthly' },
            { name: 'Batedeira Planetária (Parcela)', amount: 159.90, recurrenceType: 'installment', installments: 10 },
            { name: 'Forno Industrial (Parcela)', amount: 250.00, recurrenceType: 'installment', installments: 6 }
        ];

        for (const c of costsData) {
            // Create for current month
            const cost = new FixedCost({
                ...c,
                date: new Date(now.getFullYear(), now.getMonth(), 5), 
                user: user._id
            });
            await cost.save();
            
            // Create for previous month too (for stats consistency)
            const prevCost = new FixedCost({
                ...c,
                date: new Date(now.getFullYear(), now.getMonth() - 1, 5),
                user: user._id
            });
            await prevCost.save();
        }
        console.log(`✅ Fixed Costs created`);

        console.log('------------------------------------------------');
        console.log(`🚀 SIMULATION COMPLETE`);
        console.log(`👉 Access URL: http://localhost:4000/fluxo?token=${token}`);
        console.log('------------------------------------------------');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();