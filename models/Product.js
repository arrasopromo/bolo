const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    variableCost: { type: Number, required: true },
    salePrice: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Opcional por enquanto
});

module.exports = mongoose.model('Product', ProductSchema);