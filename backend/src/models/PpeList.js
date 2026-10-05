const mongoose = require('mongoose');

const rowSchema = new mongoose.Schema({
  risNumber: { type: String, trim: true, maxlength: 100 },
  responsibilityCenter: { type: String, trim: true, maxlength: 100 },
  stockNumber: { type: String, trim: true, maxlength: 100 },
  item: { type: String, required: true, trim: true, maxlength: 1000 },
  unit: { type: String, trim: true, maxlength: 50 },
  quantity: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, min: 0, default: null },
  totalCost: { type: Number, min: 0, default: null },
  accountCode: { type: String, trim: true, maxlength: 100 },
  source: String,
  sourceId: String,
  sourceRow: Number,
  sourceNumber: String,
}, { _id: false });

const schema = new mongoose.Schema({
  month: String,
  automatic: { type: Boolean, default: false },
  serialNumber: { type: String, required: true, trim: true, maxlength: 100 },
  lgu: { type: String, required: true, trim: true, maxlength: 200 },
  fund: { type: String, trim: true, maxlength: 200 },
  periodStart: { type: String, required: true },
  periodEnd: { type: String, required: true },
  reportDate: { type: String, required: true },
  custodian: { type: String, trim: true, maxlength: 200 },
  accountingStaff: { type: String, trim: true, maxlength: 200 },
  postedDate: String,
  referenceLayout: { type: Boolean, default: false },
  rows: { type: [rowSchema], validate: { validator: function (rows) { return this.automatic || (rows.length > 0 && rows.length <= 500); }, message: 'Enter between 1 and 500 items' } },
  recapitulation: { type: [rowSchema], default: [], validate: { validator: function (rows) { return this.automatic || rows.length <= 500; }, message: 'Enter no more than 500 recapitulation rows' } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
schema.index({ month: 1 }, { unique: true, partialFilterExpression: { automatic: true } });

module.exports = mongoose.model('PpeList', schema);
