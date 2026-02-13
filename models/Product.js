const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    variableCost: { type: Number, required: true },
    salePrice: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ingredients: [{
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient' },
        quantityUsed: { type: Number, required: true } // Quantidade usada na receita (na mesma unidade do ingrediente, convertida se necessário)
    }],
    yield: { type: Number, default: 1 }, // Rendimento da receita (quantas unidades rende)
    yieldActive: { type: Boolean, default: false }, // Se o rendimento personalizado está ativo
    markup: { type: Number, default: 0 }, // Margem de lucro desejada (%)
    platformFee: { type: Number, default: 0 }, // Taxa da plataforma (%)
    platformFeeActive: { type: Boolean, default: false }, // Se a taxa de plataforma está ativa
    invisibleCost: { type: Number, default: 0 } // Custos invisíveis (gás, energia, etc.)
});

// Prevent duplicate product names per user
ProductSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Product', ProductSchema);
