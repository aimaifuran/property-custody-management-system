const mongoose = require('mongoose');

const returnedSupplySchema = new mongoose.Schema({
  prs: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyReturnSlip', index: true },
  lguName: { type: String, trim: true },
  purpose: { type: String, trim: true },
  quantity: { type: Number },
  unit: { type: String },
  description: { type: String },
  propertyNumber: { type: String },
  mrNumber: { type: String },
  unitValue: { type: Number },
  totalValue: { type: Number },
  note: { type: String },
  returnedBy: {
    date: { type: Date },
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
  },
  returnedTo: {
    date: { type: Date },
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('ReturnedSupply', returnedSupplySchema);
