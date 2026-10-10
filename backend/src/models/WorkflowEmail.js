const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, required: true },
  text: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'SKIPPED'], default: 'PENDING' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: Date,
  sentAt: Date,
  lastError: String,
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
module.exports = mongoose.model('WorkflowEmail', schema);
