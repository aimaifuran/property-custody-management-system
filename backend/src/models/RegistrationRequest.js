const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  firstName: { type: String, required: true, maxlength: 100 },
  middleName: { type: String, maxlength: 100 },
  lastName: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true },
  username: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  office: { type: String, required: true, maxlength: 150 },
  division: { type: String, required: true, maxlength: 150 },
  position: { type: String, required: true, maxlength: 150 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reason: { type: String, maxlength: 500 },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
schema.index({ email: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
schema.index({ username: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
module.exports = mongoose.model('RegistrationRequest', schema);
