const mongoose = require('mongoose');

const FinancialStrategySchema = new mongoose.Schema({
    scenario: {
        type: String,
        enum: ['below_break_even', 'above_break_even'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    source: {
        type: String,
        default: 'General Best Practices'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FinancialStrategy', FinancialStrategySchema);
