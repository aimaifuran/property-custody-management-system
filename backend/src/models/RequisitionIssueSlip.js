const mongoose = require('mongoose');

const requisitionIssueSlipSchema = new mongoose.Schema({
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', index: true },
  risNumber: { type: String, unique: true, sparse: true, trim: true },
  entityName: { type: String },
  fundCluster: { type: String },
  division: { type: String },
  office: { type: String },
  responsibilityCenterCode: { type: String },
  purpose: { type: String },
  requestedBy: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    date: { type: Date },
  },
  approvedBy: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    date: { type: Date },
  },
  issuedBy: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    date: { type: Date },
  },
  receivedBy: {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    date: { type: Date },
  },
  date: { type: Date },
  status: {
    type: String,
    enum: ['PENDING_REVIEW', 'REVIEWED', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'ACCOUNTABILITY_LOCKED', 'REJECTED', 'DRAFT'],
    default: 'PENDING_REVIEW',
  },
  rejectionReason: { type: String },
  rejectedBy: { type: String },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  issuedAt: { type: Date },
  signatureHash: { type: String },
  items: [{
    stockNumber: String,
    unit: String,
    description: String,
    quantityRequested: Number,
    stockAvailable: Number,
    isAvailable: Boolean,
    quantityIssued: Number,
    totalCost: Number,
    remarks: String,
  }],
  totalQuantity: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('RequisitionIssueSlip', requisitionIssueSlipSchema);
