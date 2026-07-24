const mongoose = require('mongoose');

const propertyAcknowledgementReceiptSchema = new mongoose.Schema({
  iar: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport', index: true },
  entityName: { type: String, trim: true },
  fundCluster: { type: String, trim: true },
  // Omitted on the auto-created draft; the sparse unique index allows multiple
  // IARs at/above the PAR threshold to share an unassigned PAR number.
  parNumber: { type: String, unique: true, sparse: true, trim: true },
  items: [{
    quantity: Number,
    unit: String,
    description: String,
    propertyNumber: String,
    dateAcquired: Date,
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
}, { timestamps: true });

propertyAcknowledgementReceiptSchema.virtual('totalAmount').get(function getTotalAmount() {
  return (this.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
});
propertyAcknowledgementReceiptSchema.set('toJSON', { virtuals: true });
propertyAcknowledgementReceiptSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PropertyAcknowledgementReceipt', propertyAcknowledgementReceiptSchema);
