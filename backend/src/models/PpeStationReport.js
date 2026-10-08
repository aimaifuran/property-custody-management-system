const mongoose = require('mongoose');
const row = new mongoose.Schema({
  article: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 1500 },
  propertyNumber: { type: String, maxlength: 300 },
  accountablePerson: { type: String, maxlength: 200 },
  unitCost: { type: Number, min: 0, default: null },
  totalCost: { type: Number, min: 0, default: null },
  remarks: { type: String, maxlength: 300 },
}, { _id: false });
const schema = new mongoose.Schema({
  accountGroup: { type: String, required: true, trim: true, maxlength: 200 },
  governmentUnit: { type: String, required: true, maxlength: 300 },
  date: { type: String, required: true },
  preparedBy: { type: String, maxlength: 200 },
  preparedDesignation: { type: String, maxlength: 200 },
  reviewedBy: { type: String, maxlength: 200 },
  reviewedDesignation: { type: String, maxlength: 200 },
  rows: { type: [row], validate: { validator: rows => rows.length >= 1 && rows.length <= 500, message: 'Enter between 1 and 500 PPE rows' } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: Date,
}, { timestamps: true });
module.exports = mongoose.model('PpeStationReport', schema);
