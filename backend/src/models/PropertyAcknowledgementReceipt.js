const { sumAmounts, installAmountCalculation } = require('../utils/formAmounts');
const mongoose = require('mongoose');

const propertyAcknowledgementReceiptSchema = new mongoose.Schema({
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', index: true },
  ris: { type: mongoose.Schema.Types.ObjectId, ref: 'RequisitionIssueSlip', index: true },
  offlineRecipient: { type: mongoose.Schema.Types.ObjectId, ref: 'OfflineRecipient', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  acceptedAt: Date,
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  entityName: { type: String, trim: true },
  office: { type: String, trim: true },
  fundCluster: { type: String, trim: true },
  // Omitted on the auto-created draft; the sparse unique index allows multiple
  // IARs at/above the PAR threshold to share an unassigned PAR number.
  parNumber: { type: String, unique: true, sparse: true, trim: true },
  items: [{
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    serialNumber: { type: String, trim: true },
    quantity: Number,
    unit: String,
    description: String,
    propertyNumber: String,
    dateAcquired: Date,
    unitCost: { type: Number, min: 0 },
    amount: Number,
  }],
  remarks: { type: String },
  receivedBy: {
    name: { type: String, trim: true },
    position: { type: String, trim: true },
    date: { type: Date },
  },
  issuedBy: {
    name: { type: String, trim: true },
    position: { type: String, trim: true },
    date: { type: Date },
  },
  deleted: { type: Boolean, default: false },
  lastEditedAt: Date,
}, { timestamps: true });

installAmountCalculation(propertyAcknowledgementReceiptSchema, 'amount');

propertyAcknowledgementReceiptSchema.virtual('totalAmount').get(function getTotalAmount() {
  return sumAmounts((this.items || []).map(item => item.amount));
});
propertyAcknowledgementReceiptSchema.set('toJSON', { virtuals: true });
propertyAcknowledgementReceiptSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PropertyAcknowledgementReceipt', propertyAcknowledgementReceiptSchema);
