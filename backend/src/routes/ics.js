const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { listRecords } = require('../utils/paginate');
const router = express.Router();

const ICS_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'icsNumber', 'remarks',
  'receivedFrom.name', 'receivedFrom.position',
  'receivedBy.name', 'receivedBy.position',
];

router.get('/', authenticate, authorize(['canViewRIS', 'canManageRIS', 'canManageInventory']), async (req, res) => {
  const records = await listRecords(InventoryCustodianSlip, req, { baseFilter: { deleted: false, ...(req.user.role === 'admin' ? {} : { user: req.user._id }) }, searchFields: ICS_SEARCH_FIELDS, populate: 'iar' });
  return successResponse(res, 'Inventory Custodian Slips retrieved', records);
});

router.post('/', authenticate, validateAdminForm('ics'), authorize('canManageInventory'), require('../utils/createFormRecord')(InventoryCustodianSlip, ['entityName', 'office', 'fundCluster', 'icsNumber', 'items', 'remarks', 'receivedFrom', 'receivedBy'], 'Inventory Custodian Slip', 'items'));

router.put('/:id', authenticate, validateAdminForm('ics'), authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const existing = await InventoryCustodianSlip.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'Inventory Custodian Slip not found', [], 404);
  const fields = ['entityName', 'office', 'fundCluster', 'icsNumber', 'items', 'remarks', 'receivedFrom', 'receivedBy'];
  const payload = Object.fromEntries(fields.filter(field => req.body[field] !== undefined).map(field => [field, req.body[field]]));
  if (existing.user || existing.offlineRecipient) {
    if ((req.body.user !== undefined && String(req.body.user?._id || req.body.user || '') !== String(existing.user || '')) || (req.body.offlineRecipient !== undefined && String(req.body.offlineRecipient?._id || req.body.offlineRecipient || '') !== String(existing.offlineRecipient || ''))) return errorResponse(res, 'The recipient of a linked accountability form cannot be changed', [], 409);
    const identity = rows => rows.map(item => [Number(item.quantity), Number(item.unitCost), item.inventoryItemNo]);
    if ((payload.icsNumber !== undefined && payload.icsNumber !== existing.icsNumber) ||
        JSON.stringify(identity(payload.items || [])) !== JSON.stringify(identity(existing.items))) {
      return errorResponse(res, 'Issued quantities, costs, item numbers and the ICS number cannot be changed. Use the stock and custody workflow for movements.', [], 409);
    }
    // Keep row identities and accountability links while allowing document corrections.
    payload.items = payload.items.map((item, index) => ({
      ...existing.items[index].toObject(), unit: item.unit, description: existing.items[index].serialNumber && !String(item.description || '').includes(`S/N: ${existing.items[index].serialNumber}`) ? `${item.description || ''} (S/N: ${existing.items[index].serialNumber})` : item.description,
      estimatedUsefulLife: item.estimatedUsefulLife,
    }));
  }
  const record = await InventoryCustodianSlip.findOneAndUpdate({ _id: req.params.id, deleted: false }, { ...payload, lastEditedAt: new Date() }, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Inventory Custodian Slip not found', [], 404);
  return successResponse(res, 'Inventory Custodian Slip updated', record);
});

module.exports = router;
