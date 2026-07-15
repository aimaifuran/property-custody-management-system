const mongoose = require('mongoose');

const inspectionAcceptanceReportSchema = new mongoose.Schema({
  iarNumber: { type: String, required: true, unique: true, trim: true },
  poNumber: { type: String, required: true, trim: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNumber: { type: String, required: true, trim: true },
  inspectionDate: { type: Date, required: true },
  acceptanceDate: { type: Date, required: true },
  purchaseDate: { type: Date, required: true },
  receivedBy: { type: String, required: true },
  inspectedBy: { type: String, required: true },
  acceptedBy: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDING_INSPECTION', 'INSPECTED_ACCEPTED', 'LOGGED_TO_STOCKS', 'REJECTED', 'APPROVED'],
    default: 'PENDING_INSPECTION',
  },
  items: [{
    stockNumber: String,
    item: String,
    description: String,
    serialNumber: String,
    propertyNumber: String,
    quantity: Number,
    unitCost: Number,
    totalCost: Number,
    acceptanceStatus: String,
    remarks: String,
  }],
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('InspectionAcceptanceReport', inspectionAcceptanceReportSchema);
