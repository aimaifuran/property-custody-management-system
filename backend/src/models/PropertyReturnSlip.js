const mongoose = require('mongoose');

const propertyReturnSlipSchema = new mongoose.Schema({
  prsNumber: { type: String, unique: true, sparse: true, trim: true },
  lguName: { type: String, trim: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['PENDING', 'RETURNED', 'REJECTED'], default: 'RETURNED' },
  pendingKey: { type: String, unique: true, sparse: true },
  rejectionReason: String,
  // Holds the chosen purpose; when the "Other" option is picked on the form,
  // this stores the free-text value the user specified instead.
  purpose: { type: String, trim: true },
  items: [{
    ris: { type: mongoose.Schema.Types.ObjectId, ref: 'RequisitionIssueSlip' },
    risItem: { type: mongoose.Schema.Types.ObjectId },
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
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
