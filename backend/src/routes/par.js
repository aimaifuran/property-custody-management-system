const express = require('express');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { paginateAndSearch } = require('../utils/paginate');
const router = express.Router();

const PAR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'parNumber', 'remarks',
  'receivedBy.name', 'receivedBy.position',
  'issuedBy.name', 'issuedBy.position',
];

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const { data, pagination } = await paginateAndSearch(PropertyAcknowledgementReceipt, req, {
    baseFilter: { deleted: false },
    searchFields: PAR_SEARCH_FIELDS,
    populate: 'iar',
  });
  return successResponse(res, 'Property Acknowledgement Receipts retrieved', { items: data, pagination });
});

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const record = await PropertyAcknowledgementReceipt.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Property Acknowledgement Receipt not found', [], 404);
  return successResponse(res, 'Property Acknowledgement Receipt updated', record);
});

module.exports = router;
