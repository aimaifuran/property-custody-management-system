const mongoose = require('mongoose');

const propertyAccountabilitySchema = new mongoose.Schema({
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  ris: { type: mongoose.Schema.Types.ObjectId, ref: 'RequisitionIssueSlip', index: true },
  risItem: mongoose.Schema.Types.ObjectId,
  issuanceForm: mongoose.Schema.Types.ObjectId,
  quantity: Number,
  returnedQuantity: { type: Number, default: 0 },
  acceptedAt: Date,
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pendingMovement: { type: String },
  transferHistory: [{ from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, ptr: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyTransferReport' }, fromDocumentNumber: String, toDocumentNumber: String, date: Date }],
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
