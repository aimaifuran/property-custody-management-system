const mongoose = require('mongoose');

const propertyTransferReportSchema = new mongoose.Schema({
  entityName: { type: String, trim: true },
  fundCluster: { type: String, trim: true },
  fromAccountableOfficer: { type: String, trim: true },
  toAccountableOfficer: { type: String, trim: true },
  ptrNumber: { type: String, required: true, unique: true, trim: true },
  date: { type: Date },
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['RECORDED', 'PENDING_RECEIVER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED'], default: 'RECORDED' },
  receiverConfirmedAt: Date,
  rejectionReason: String,
  // Holds the chosen transfer type; when the "Others" option is picked on the
  // form, this stores the free-text value the user specified instead.
  transferType: { type: String, trim: true },
  items: [{
    accountability: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyAccountability' },
    dateAcquired: Date,
    propertyNumber: String,
    description: String,
    amount: Number,
    condition: String,
  }],
  remarks: { type: String },
  reasonForTransfer: { type: String },
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
  deleted: { type: Boolean, default: false },
  lastEditedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('PropertyTransferReport', propertyTransferReportSchema);
