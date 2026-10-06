const express = require('express');
const ReturnedSupply = require('../models/ReturnedSupply');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { listRecords } = require('../utils/paginate');
const router = express.Router();
const { linkReturnItems, validateLinks } = require('../utils/returnLinks');

const RETURNED_SUPPLY_SEARCH_FIELDS = [
  'lguName', 'purpose', 'unit', 'description', 'propertyNumber', 'mrNumber', 'note',
  'returnedBy.name', 'returnedBy.designation',
  'returnedTo.name', 'returnedTo.designation',
];

router.get('/', authenticate, authorize(['canViewDashboard', 'canManageInventory']), async (req, res) => {
  const records = await listRecords(ReturnedSupply, req, { baseFilter: { deleted: false }, searchFields: RETURNED_SUPPLY_SEARCH_FIELDS, populate: 'prs' });
  return successResponse(res, 'Returned supply retrieved', records);
});

const fields = ['lguName', 'purpose', 'quantity', 'unit', 'description', 'propertyNumber', 'mrNumber', 'unitValue', 'note', 'returnedBy', 'returnedTo', 'ris', 'risItem'];
const saveSupply = async (req, res) => {
  const existing = req.params.id ? await ReturnedSupply.findOne({ _id: req.params.id, deleted: false }) : null;
  if (req.params.id && !existing) return errorResponse(res, 'Returned supply record not found', [], 404);
  if (existing?.prs) return errorResponse(res, 'Edit the linked Return Slip to update this return and its user account together', [], 400);
  const source = { ...(existing?.toObject() || {}), ...req.body };
  const payload = Object.fromEntries(fields.filter(field => Object.hasOwn(source, field)).map(field => [field, source[field]]));
  if (!String(payload.description || '').trim() || !(Number(payload.quantity) > 0) || !Number.isFinite(Number(payload.quantity))) return errorResponse(res, 'An item description and positive quantity are required', [], 400);
  const linked = { returnedBy: payload.returnedBy, items: [payload] };
  try { await linkReturnItems(linked); await validateLinks(linked.items, existing?._id); }
  catch (error) { return errorResponse(res, error.message, [], 400); }
  payload.returnedBy = linked.returnedBy;
  payload.totalValue = Number(payload.quantity) * Number(payload.unitValue || 0);
  const record = existing ? await ReturnedSupply.findByIdAndUpdate(existing._id, payload, { returnDocument: 'after', runValidators: true }) : await ReturnedSupply.create(payload);
  return successResponse(res, existing ? 'Returned supply updated' : 'Returned supply record created', record, existing ? 200 : 201);
};
router.post('/', authenticate, authorize('canManageInventory'), saveSupply);
router.put('/:id', authenticate, authorize('canManageInventory'), saveSupply);

module.exports = router;
