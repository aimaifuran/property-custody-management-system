const express = require('express');
const PropertyCard = require('../models/PropertyCard');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { paginateAndSearch } = require('../utils/paginate');
const router = express.Router();

const PROPERTY_CARD_SEARCH_FIELDS = [
  'poNumber', 'entityName', 'fundCluster', 'propertyPlantAndEquipment', 'propertyNumber',
  'description', 'serialNumber',
];

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const { data, pagination } = await paginateAndSearch(PropertyCard, req, {
    baseFilter: { deleted: false },
    searchFields: PROPERTY_CARD_SEARCH_FIELDS,
    populate: ['iar', 'inventory'],
  });
  return successResponse(res, 'Property cards retrieved', { items: data, pagination });
});

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const card = await PropertyCard.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!card) return errorResponse(res, 'Property card not found', [], 404);
  return successResponse(res, 'Property card updated', card);
});

module.exports = router;
