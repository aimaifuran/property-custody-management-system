const express = require('express');
const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const records = await PropertyAcknowledgementReceipt.find({ deleted: false }).populate('iar').sort({ createdAt: -1 });
  return successResponse(res, 'Property Acknowledgement Receipts retrieved', records);
});

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const record = await PropertyAcknowledgementReceipt.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Property Acknowledgement Receipt not found', [], 404);
  return successResponse(res, 'Property Acknowledgement Receipt updated', record);
});

module.exports = router;
