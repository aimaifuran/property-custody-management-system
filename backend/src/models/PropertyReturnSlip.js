const mongoose = require('mongoose');

const propertyReturnSlipSchema = new mongoose.Schema({
  prsNumber: { type: String, required: true, unique: true, trim: true },
  accountability: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyAccountability', required: true },
  returnDate: { type: Date, required: true },
  condition: { type: String, required: true },
  serviceable: { type: Boolean, required: true },
  remarks: { type: String },
  status: {
    type: String,
    enum: ['PENDING_RETURN', 'RETURN_IN_TRANSIT', 'RETURNED_UNSERVICEABLE', 'RETURNED', 'IN_STORAGE_AVAILABLE', 'IN_STORAGE_UNSERVICEABLE'],
    default: 'PENDING_RETURN',
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PropertyReturnSlip', propertyReturnSlipSchema);
