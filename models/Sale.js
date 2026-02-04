const mongoose = require('mongoose');

const SaleSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    totalCost: { type: Number, required: true },
    profit: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['pix', 'credit', 'debit', 'cash', 'platform'], default: 'pix' },
    platformFee: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    notes: { type: String, maxLength: 200 },
    date: { type: Date, default: Date.now },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

module.exports = mongoose.model('Sale', SaleSchema);
