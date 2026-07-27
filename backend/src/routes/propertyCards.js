const express = require('express');
const PropertyCard = require('../models/PropertyCard');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const cards = await PropertyCard.find({ deleted: false }).populate('iar').populate('inventory').sort({ createdAt: -1 });
  return successResponse(res, 'Property cards retrieved', cards);
});

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const card = await PropertyCard.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!card) return errorResponse(res, 'Property card not found', [], 404);
  return successResponse(res, 'Property card updated', card);
});

module.exports = router;
