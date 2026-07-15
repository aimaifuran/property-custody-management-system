const mongoose = require('mongoose');

const propertyTransferReportSchema = new mongoose.Schema({
  ptrNumber: { type: String, required: true, unique: true, trim: true },
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  oldAccountableOfficer: { type: String, required: true },
  newAccountableOfficer: { type: String, required: true },
  transferDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDING_TRANSFER', 'TRANSFER_PENDING', 'TRANSFERRED'],
    default: 'PENDING_TRANSFER',
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PropertyTransferReport', propertyTransferReportSchema);
