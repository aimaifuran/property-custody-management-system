const mongoose = require('mongoose');

const propertyCardSchema = new mongoose.Schema({
  stockItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', unique: true, sparse: true },
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', index: true },
  // New cards are unique per stock item; legacy IAR references remain readable.
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  month: { type: String },
  poNumber: { type: String },
  entityName: { type: String },
  fundCluster: { type: String },
  propertyPlantAndEquipment: { type: String },
  propertyNumber: { type: String },
  description: { type: String },
  serialNumber: { type: String },
  items: [{
    sourceType: { type: String, enum: ['IAR', 'RIS', 'PTR', 'PRS'] },
    sourceDocument: mongoose.Schema.Types.ObjectId,
    sourceDate: Date,
    sourceRemarks: String,
    propertyPlantAndEquipment: { type: String, trim: true },
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    serialNumber: { type: String, trim: true },
    propertyNumber: String,
    description: String,
    date: Date,
    referenceParNo: String,
    receiptQuantity: Number,
    itdQuantity: Number,
    itdOfficeOfficer: String,
    balanceQuantity: Number,
    unitCost: Number,
    amount: Number,
    remarks: String,
  }],
  // Kept for compatibility with Property Card records created before the
  // one-card-per-IAR workflow.
  entries: [{
    date: Date,
    referenceParNo: String,
    receiptQuantity: Number,
    itdQuantity: Number,
    itdOfficeOfficer: String,
    balanceQuantity: Number,
    unitCost: Number,
    amount: Number,
    remarks: String,
  }],
  deleted: { type: Boolean, default: false },
  lastEditedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('PropertyCard', propertyCardSchema);
