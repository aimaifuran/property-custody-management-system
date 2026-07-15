const mongoose = require('mongoose');

const ledgerTransactionSchema = new mongoose.Schema({
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  type: { type: String, enum: ['incoming', 'outgoing'], required: true },
  quantity: { type: Number, required: true },
  reference: { type: String, required: true },
  description: { type: String },
  runningBalance: { type: Number, required: true },
  transactionDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

ledgerTransactionSchema.index({ inventory: 1, transactionDate: -1 });

module.exports = mongoose.model('LedgerTransaction', ledgerTransactionSchema);