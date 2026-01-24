const mongoose = require('mongoose');

const FixedCostSchema = new mongoose.Schema({
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now }, // Functions as the start date or payment date
    description: { type: String },
    recurrenceType: { type: String, enum: ['monthly', 'installment'], default: 'monthly' },
    installments: { type: Number, default: 1 } // Total installments if type is 'installment'
});

module.exports = mongoose.model('FixedCost', FixedCostSchema);