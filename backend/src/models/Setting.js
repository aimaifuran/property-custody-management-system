const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  entityName: { type: String, default: '', maxlength: 300 },
  organizationName: { type: String, default: 'Supply Office' },
  officeLogo: { type: String },
  developerPictures: { type: Map, of: String, default: {} },
  governmentAgency: { type: String, default: 'Government Agency' },
  address: { type: String, default: 'Office Address' },
  telephone: { type: String, default: '000-0000' },
  footer: { type: String, default: 'Property Accountability Management System' },
  systemName: { type: String, default: 'PCMS' },
  lguName: { type: String, default: 'LGU-CARIGARA' },
  ppeReportSignatories: {
    preparedBy: { type: String, default: 'RALPH M. SAVERET JR.', maxlength: 200 },
    preparedDesignation: { type: String, default: 'Property Personnel', maxlength: 200 },
    reviewedBy: { type: String, default: 'ATTY. LEO L. PRUEL', maxlength: 200 },
    reviewedDesignation: { type: String, default: 'Head Property Unit', maxlength: 200 },
  },
  rememberedSignatories: { type: Map, of: new mongoose.Schema({ name: String, designation: String, position: String }, { _id: false }), default: {} },
  signatories: {
    requestedBy: { name: { type: String, default: '' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: false } },
    approvedBy: { name: { type: String, default: 'RALPH M. SAVERET JR' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: true } },
    issuedBy: { name: { type: String, default: 'RALPH M. SAVERET JR' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: true } },
    receivedBy: { name: { type: String, default: '' }, designation: { type: String, default: '' }, fixed: { type: Boolean, default: false } },
  },
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
