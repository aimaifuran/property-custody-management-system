const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  stockNumber: { type: String, required: true, unique: true, trim: true },
  unit: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, default: 'General' },
  cost: { type: Number, required: true, default: 0 },
  quantityOnHand: { type: Number, required: true, default: 0 },
  status: {
    type: String,
    enum: ['IN_STORAGE', 'ACTIVE_IN_USE', 'TRANSFERRED', 'RETURNED_UNSERVICEABLE', 'IN_STORAGE_UNSERVICEABLE', 'IN_STORAGE_AVAILABLE', 'ISSUED', 'RETURNED', 'UNSERVICEABLE'],
    default: 'IN_STORAGE',
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

itemSchema.index({ description: 'text', stockNumber: 1 });

module.exports = mongoose.model('Item', itemSchema);
