const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  organizationName: { type: String, default: 'Supply Office' },
  officeLogo: { type: String },
  governmentAgency: { type: String, default: 'Government Agency' },
  address: { type: String, default: 'Office Address' },
  telephone: { type: String, default: '000-0000' },
  footer: { type: String, default: 'Property Custody Management System' },
  systemName: { type: String, default: 'PCMS' },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);