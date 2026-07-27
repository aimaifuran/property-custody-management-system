const express = require('express');
const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const records = await InventoryCustodianSlip.find({ deleted: false }).populate('iar').sort({ createdAt: -1 });
  return successResponse(res, 'Inventory Custodian Slips retrieved', records);
});

router.put('/:id', authenticate, authorize(['canManageInventory', 'canManageRIS']), async (req, res) => {
  const record = await InventoryCustodianSlip.findOneAndUpdate({ _id: req.params.id, deleted: false }, req.body, { new: true, runValidators: true });
  if (!record) return errorResponse(res, 'Inventory Custodian Slip not found', [], 404);
  return successResponse(res, 'Inventory Custodian Slip updated', record);
});

module.exports = router;
