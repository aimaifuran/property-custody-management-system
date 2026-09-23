const mongoose = require('mongoose');

const propertyReturnSlipSchema = new mongoose.Schema({
  prsNumber: { type: String, unique: true, sparse: true, trim: true },
  lguName: { type: String, trim: true },
  // Holds the chosen purpose; when the "Other" option is picked on the form,
  // this stores the free-text value the user specified instead.
  purpose: { type: String, trim: true },
  items: [{
    quantity: Number,
    unit: String,
    description: String,
    propertyNumber: String,
    mrNumber: String,
    unitValue: Number,
    totalValue: Number,
  }],
  note: { type: String },
  returnedBy: {
    date: { type: Date },
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
  },
  returnedTo: {
    date: { type: Date },
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
  },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PropertyReturnSlip', propertyReturnSlipSchema);
