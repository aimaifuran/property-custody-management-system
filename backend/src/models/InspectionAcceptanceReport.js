const { sumAmounts } = require('../utils/formAmounts');
const mongoose = require('mongoose');

const inspectionAcceptanceReportSchema = new mongoose.Schema({
  submissionKey: { type: String, unique: true, sparse: true },
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
    inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
    inventories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' }],
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    serialNumbers: [String],
    serialNumber: { type: String, trim: true },
    itemType: { type: String, enum: ['SUPPLY', 'ASSET'], default: 'ASSET' },
    stockNumber: String,
    stockPropertyNumber: String,
    propertyPlantAndEquipment: { type: String, trim: true },
    description: String,
    unit: String,
    quantity: Number,
    acceptedQuantity: { type: Number, min: 0 },
    unitCost: Number,
    totalCost: Number,
    // Legacy item fields retained for older records.
    item: String,
    propertyNumber: String,
    acceptanceStatus: String,
    remarks: String,
  }],
  deleted: { type: Boolean, default: false },
  lastEditedAt: Date,
}, { timestamps: true });

inspectionAcceptanceReportSchema.virtual('totalAmount').get(function () {
  return sumAmounts((this.items || []).map(item => item.totalCost));
});
inspectionAcceptanceReportSchema.set('toJSON', { virtuals: true });
inspectionAcceptanceReportSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('InspectionAcceptanceReport', inspectionAcceptanceReportSchema);
