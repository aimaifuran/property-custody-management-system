const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  action: { type: String, required: true },
  date: { type: Date, default: Date.now },
  performedBy: { type: String, trim: true },
  custodian: { type: String, trim: true },
  office: { type: String, trim: true },
  status: { type: String, required: true },
  condition: { type: String, trim: true },
  remarks: { type: String, trim: true },
  expectedQuantity: Number,
  physicalQuantity: Number,
}, { _id: false });

const propertySchema = new mongoose.Schema({
  propertyCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
  propertyName: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category: { type: String, required: true, trim: true },
  acquisitionDate: Date,
  acquisitionCost: { type: Number, min: 0, default: 0 },
  supplier: { type: String, trim: true },
  purchaseOrderNumber: { type: String, trim: true },
  sourceOfFund: { type: String, trim: true },
  location: { type: String, trim: true },
  serialNumber: { type: String, trim: true },
  specifications: {
    brand: String, model: String, processor: String, ram: String, storage: String,
    operatingSystem: String, material: String, size: String, color: String,
  },
  quantity: { type: Number, min: 1, default: 1 },
  status: {
    type: String,
    enum: ['AVAILABLE', 'ISSUED', 'IN_USE', 'TRANSFERRED', 'RETURNED', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'FOR_DISPOSAL', 'DISPOSED'],
    default: 'AVAILABLE',
  },
  condition: { type: String, default: 'Serviceable', trim: true },
  currentCustodian: { name: String, office: String, assignedDate: Date },
  remarks: { type: String, trim: true },
  events: { type: [eventSchema], default: [] },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

propertySchema.index({ propertyName: 'text', propertyCode: 'text', serialNumber: 'text', category: 'text', 'currentCustodian.name': 'text' });
module.exports = mongoose.model('Property', propertySchema);
