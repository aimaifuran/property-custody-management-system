const mongoose = require('mongoose');

const propertyCardSchema = new mongoose.Schema({
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', required: true, index: true },
  // A Property Card is one document per IAR. Every received item belongs in
  // this array instead of creating a separate Property Card document.
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
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    propertyNumber: String,
    description: String,
    serialNumber: String,
    date: Date,
    referenceParNo: String,
    receiptQuantity: Number,
    itdQuantity: Number,
    itdOfficeOfficer: String,
    balanceQuantity: Number,
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
    amount: Number,
    remarks: String,
  }],
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PropertyCard', propertyCardSchema);
