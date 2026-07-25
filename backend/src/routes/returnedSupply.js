const express = require('express');
const ReturnedSupply = require('../models/ReturnedSupply');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const records = await ReturnedSupply.find({ deleted: false }).populate('prs').sort({ createdAt: -1 });
  return successResponse(res, 'Returned supply retrieved', records);
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const record = await ReturnedSupply.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Returned supply record not found', [], 404);
  return successResponse(res, 'Returned supply updated', record);
});

module.exports = router;
