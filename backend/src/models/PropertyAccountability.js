const mongoose = require('mongoose');

const propertyAccountabilitySchema = new mongoose.Schema({
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  employee: { type: String, required: true },
  office: { type: String, required: true },
  serialNumber: { type: String, trim: true },
  propertyNumber: { type: String, trim: true },
  issueDate: { type: Date, required: true },
  condition: { type: String, default: 'Serviceable' },
  remarks: { type: String },
  formType: { type: String, enum: ['ICS', 'PAR'], required: true },
  documentNumber: { type: String, required: true },
  signatureHash: { type: String },
  active: { type: Boolean, default: true },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PropertyAccountability', propertyAccountabilitySchema);
