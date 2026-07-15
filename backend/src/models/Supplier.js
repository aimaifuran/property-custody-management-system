const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  contactNumber: { type: String, required: true, trim: true },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

supplierSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Supplier', supplierSchema);