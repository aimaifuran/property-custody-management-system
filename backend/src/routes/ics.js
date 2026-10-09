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
  if (existing?.user) return errorResponse(res, 'Linked accountability forms are locked. Use acceptance, transfer or return actions.', [], 409);
  const record = await InventoryCustodianSlip.findOneAndUpdate({ _id: req.params.id, deleted: false }, { ...req.body, lastEditedAt: new Date() }, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Inventory Custodian Slip not found', [], 404);
  return successResponse(res, 'Inventory Custodian Slip updated', record);
});

module.exports = router;
