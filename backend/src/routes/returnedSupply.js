const express = require('express');
const ReturnedSupply = require('../models/ReturnedSupply');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { paginateAndSearch } = require('../utils/paginate');
const router = express.Router();

const RETURNED_SUPPLY_SEARCH_FIELDS = [
  'lguName', 'purpose', 'unit', 'description', 'propertyNumber', 'mrNumber', 'note',
  'returnedBy.name', 'returnedBy.designation',
  'returnedTo.name', 'returnedTo.designation',
];

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const { data, pagination } = await paginateAndSearch(ReturnedSupply, req, {
    baseFilter: { deleted: false },
    searchFields: RETURNED_SUPPLY_SEARCH_FIELDS,
    populate: 'prs',
  });
  return successResponse(res, 'Returned supply retrieved', { items: data, pagination });
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const record = await ReturnedSupply.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Returned supply record not found', [], 404);
  return successResponse(res, 'Returned supply updated', record);
});

module.exports = router;
