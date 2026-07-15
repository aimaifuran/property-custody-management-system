const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  details: { type: String },
  ipAddress: { type: String },
  browser: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);