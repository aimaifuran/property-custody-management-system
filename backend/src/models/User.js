const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  office: { type: String, required: true },
  division: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  permissions: [{ type: String }],
  refreshToken: { type: String },
  failedLoginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  pendingEmail: { type: String, trim: true, lowercase: true },
  emailChangeCode: { type: String },
  emailChangeExpiry: { type: Date },
  lastLogin: { type: Date },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.index({ email: 1, username: 1 });

module.exports = mongoose.model('User', userSchema);