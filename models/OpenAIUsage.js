const mongoose = require('mongoose');

const openAIUsageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    endpoint: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    tokens_input: {
        type: Number,
        default: 0
    },
    tokens_output: {
        type: Number,
        default: 0
    },
    duration_seconds: {
        type: Number,
        default: 0
    },
    cost_usd: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('OpenAIUsage', openAIUsageSchema);
