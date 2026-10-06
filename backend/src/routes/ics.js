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
  const records = await listRecords(InventoryCustodianSlip, req, { baseFilter: { deleted: false }, searchFields: ICS_SEARCH_FIELDS, populate: 'iar' });
  return successResponse(res, 'Inventory Custodian Slips retrieved', records);
});

router.post('/', authenticate, authorize('canManageInventory'), require('../utils/createFormRecord')(InventoryCustodianSlip, ['entityName', 'office', 'fundCluster', 'icsNumber', 'items', 'remarks', 'receivedFrom', 'receivedBy'], 'Inventory Custodian Slip', 'items'));

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const record = await InventoryCustodianSlip.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Inventory Custodian Slip not found', [], 404);
  return successResponse(res, 'Inventory Custodian Slip updated', record);
});

module.exports = router;
