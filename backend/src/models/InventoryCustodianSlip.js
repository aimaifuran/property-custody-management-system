const mongoose = require('mongoose');

const inventoryCustodianSlipSchema = new mongoose.Schema({
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', index: true },
  entityName: { type: String, trim: true },
  fundCluster: { type: String, trim: true },
  // Omitted on the auto-created draft; the sparse unique index allows multiple
  // IARs below the PAR threshold to share an unassigned ICS number.
  icsNumber: { type: String, unique: true, sparse: true, trim: true },
  items: [{
    quantity: Number,
    unit: String,
    unitCost: Number,
    totalCost: Number,
    description: String,
    inventoryItemNo: String,
    estimatedUsefulLife: String,
  }],
  remarks: { type: String },
  receivedFrom: {
    name: { type: String, trim: true },
    position: { type: String, trim: true },
    date: { type: Date },
  },
  receivedBy: {
    name: { type: String, trim: true },
    position: { type: String, trim: true },
    date: { type: Date },
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

inventoryCustodianSlipSchema.virtual('totalAmount').get(function getTotalAmount() {
  return (this.items || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
});
inventoryCustodianSlipSchema.set('toJSON', { virtuals: true });
inventoryCustodianSlipSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('InventoryCustodianSlip', inventoryCustodianSlipSchema);
