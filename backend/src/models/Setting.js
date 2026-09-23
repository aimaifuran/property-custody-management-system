const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  organizationName: { type: String, default: 'Supply Office' },
  officeLogo: { type: String },
  governmentAgency: { type: String, default: 'Government Agency' },
  address: { type: String, default: 'Office Address' },
  telephone: { type: String, default: '000-0000' },
  footer: { type: String, default: 'Property Accountability Management System' },
  systemName: { type: String, default: 'PCMS' },
  lguName: { type: String, default: 'LGU-CARIGARA' },
  signatories: {
    requestedBy: { name: { type: String, default: '' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: false } },
    approvedBy: { name: { type: String, default: 'RALPH M. SAVERET JR' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: true } },
    issuedBy: { name: { type: String, default: 'RALPH M. SAVERET JR' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: true } },
    receivedBy: { name: { type: String, default: '' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: false } },
  },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);