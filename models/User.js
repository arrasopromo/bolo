const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    cpf: { type: String },
    phone: { type: String },
    token: { type: String },
    plan: { type: String, enum: ['basic', 'complete', 'test'], default: 'basic' },
    status: { type: String, default: 'pending' },
    subscriptionStatus: { type: String, enum: ['active', 'inactive', 'expired'], default: 'inactive' },
    subscriptionExpiresAt: { type: Date },
    subscriptionType: { type: String, enum: ['bonus', 'paid', 'lifetime'], default: 'bonus' },
    
    // Break-even Data
    breakEvenPoint: { type: Number }, // Calculated break-even revenue
    fixedCostsInput: { type: Number },
    avgRevenueInput: { type: Number },
    avgVariableCostInput: { type: Number },
    breakEvenCalculatedAt: { type: Date },

    createdAt: { type: Date, default: Date.now },
    
    // Permissions / Order Bumps
    massasPerfeitasAccess: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', UserSchema);