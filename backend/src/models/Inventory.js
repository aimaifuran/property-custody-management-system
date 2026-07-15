const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  serialNumber: { type: String, trim: true },
  propertyNumber: { type: String, trim: true },
  quantity: { type: Number, required: true, default: 0 },
  unitCost: { type: Number, required: true, default: 0 },
  assetCost: { type: Number, required: true, default: 0 },
  status: {
    type: String,
    enum: ['LOGGED_TO_STOCKS', 'IN_STORAGE', 'ACTIVE_IN_USE', 'TRANSFERRED', 'RETURNED_UNSERVICEABLE', 'IN_STORAGE_UNSERVICEABLE', 'IN_STORAGE_AVAILABLE', 'ISSUED', 'RETURNED', 'UNSERVICEABLE'],
    default: 'LOGGED_TO_STOCKS',
  },
  accountability: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyAccountability' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  purchaseDate: { type: Date },
  inspectionAcceptanceReport: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionAcceptanceReport' },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);
