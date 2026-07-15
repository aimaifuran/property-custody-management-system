const mongoose = require('mongoose');

const requisitionIssueSlipSchema = new mongoose.Schema({
  risNumber: { type: String, required: true, unique: true, trim: true },
  entityName: { type: String, required: true },
  fundCluster: { type: String, required: true },
  division: { type: String, required: true },
  office: { type: String, required: true },
  responsibilityCenterCode: { type: String, required: true },
  purpose: { type: String, required: true },
  requestedBy: { type: String, required: true },
  approvedBy: { type: String },
  issuedBy: { type: String },
  receivedBy: { type: String, required: true },
  date: { type: Date, required: true },
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
    remarks: String,
  }],
  totalQuantity: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('RequisitionIssueSlip', requisitionIssueSlipSchema);
