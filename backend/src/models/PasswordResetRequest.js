const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  activeKey: { type: String },
  status: { type: String, enum: ['PENDING', 'SENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED'], default: 'PENDING' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reason: { type: String, maxlength: 500 },
  tokenHash: { type: String, select: false },
  expiresAt: Date,
}, { timestamps: true });
schema.index({ activeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PasswordResetRequest', schema);
