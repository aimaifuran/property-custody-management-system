const mongoose = require('mongoose');

const inspectionAcceptanceReportSchema = new mongoose.Schema({
  entityName: { type: String, trim: true },
  fundCluster: { type: String, trim: true },
  supplierName: { type: String, trim: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  poNumber: { type: String, trim: true },
  poDate: { type: Date },
  responsibilityCenterCode: { type: String, trim: true },
  iarNumber: { type: String, required: true, unique: true, trim: true },
  iarDate: { type: Date },
  invoiceNumber: { type: String, trim: true },
  invoiceDate: { type: Date },
  inspectionDate: { type: Date },
  inspectedBy: { type: String, trim: true },
  acceptanceDate: { type: Date },
  acceptanceStatus: { type: String, enum: ['Complete', 'Partial'], default: 'Complete' },
  acceptanceQuantity: { type: Number },
  custodian: { type: String, trim: true },
  propertyCards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PropertyCard' }],
  requisition: { type: mongoose.Schema.Types.ObjectId, ref: 'RequisitionIssueSlip' },
  inventoryCustodianSlip: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCustodianSlip' },
  propertyAcknowledgementReceipt: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyAcknowledgementReceipt' },
  // Legacy names are retained so existing reports and inventory records remain readable.
  purchaseDate: { type: Date },
  receivedBy: { type: String, trim: true },
  acceptedBy: { type: String, trim: true },
  status: {
    type: String,
    enum: ['PENDING_INSPECTION', 'INSPECTED_ACCEPTED', 'LOGGED_TO_STOCKS', 'REJECTED', 'APPROVED'],
    default: 'PENDING_INSPECTION',
  },
  items: [{
    stockNumber: String,
    stockPropertyNumber: String,
    description: String,
    unit: String,
    quantity: Number,
    unitCost: Number,
    totalCost: Number,
    // Legacy item fields retained for older records.
    item: String,
    serialNumber: String,
    propertyNumber: String,
    acceptanceStatus: String,
    remarks: String,
  }],
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('InspectionAcceptanceReport', inspectionAcceptanceReportSchema);
