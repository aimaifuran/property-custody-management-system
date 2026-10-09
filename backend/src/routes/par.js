const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { listRecords } = require('../utils/paginate');
const router = express.Router();

const PAR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'parNumber', 'remarks',
  'receivedBy.name', 'receivedBy.position',
  'issuedBy.name', 'issuedBy.position',
];

router.get('/', authenticate, authorize(['canViewRIS', 'canManageRIS', 'canManageInventory']), async (req, res) => {
  const records = await listRecords(PropertyAcknowledgementReceipt, req, { baseFilter: { deleted: false, ...(req.user.role === 'admin' ? {} : { user: req.user._id }) }, searchFields: PAR_SEARCH_FIELDS, populate: 'iar' });
  return successResponse(res, 'Property Acknowledgement Receipts retrieved', records);
});

router.post('/', authenticate, validateAdminForm('par'), authorize('canManageInventory'), require('../utils/createFormRecord')(PropertyAcknowledgementReceipt, ['entityName', 'office', 'fundCluster', 'parNumber', 'items', 'remarks', 'receivedBy', 'issuedBy'], 'Property Acknowledgement Receipt', 'items'));

router.put('/:id', authenticate, validateAdminForm('par'), authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const existing = await PropertyAcknowledgementReceipt.findOne({ _id: req.params.id, deleted: false });
  if (existing?.user) return errorResponse(res, 'Linked accountability forms are locked. Use acceptance, transfer or return actions.', [], 409);
  const record = await PropertyAcknowledgementReceipt.findOneAndUpdate({ _id: req.params.id, deleted: false }, { ...req.body, lastEditedAt: new Date() }, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Property Acknowledgement Receipt not found', [], 404);
  return successResponse(res, 'Property Acknowledgement Receipt updated', record);
});

module.exports = router;
