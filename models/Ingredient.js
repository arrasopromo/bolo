const mongoose = require('mongoose');

const IngredientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, required: true, enum: ['kg', 'g', 'l', 'ml', 'un'] },
    quantityPackage: { type: Number, required: true }, // Quantidade na embalagem comprada
    currentStock: { type: Number, default: 0 }, // Estoque atual
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

// Prevent duplicate ingredient names per user
IngredientSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Ingredient', IngredientSchema);
