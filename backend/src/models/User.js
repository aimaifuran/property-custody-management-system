const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  office: { type: String, required: true },
  division: { type: String, required: true },
  position: { type: String, trim: true, maxlength: 150 },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  locked: { type: Boolean, default: false },
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
