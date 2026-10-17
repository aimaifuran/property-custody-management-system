const express = require('express');
const Item = require('../models/Item');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const items = await Item.find({ deleted: false }).sort({ createdAt: -1 });
  return successResponse(res, 'Items retrieved', items);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  if (Number(req.body.quantityOnHand || 0) !== 0) return errorResponse(res, 'Record initial stock through an accepted IAR or an inventory receipt', [], 400);
  const item = await Item.create({ ...req.body, quantityOnHand: 0 });
  return successResponse(res, 'Item created', item, 201);
});

module.exports = router;
