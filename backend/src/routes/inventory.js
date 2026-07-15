const express = require('express');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const inventories = await Inventory.find({ deleted: false }).populate('item').populate('supplier').populate('accountability').sort({ createdAt: -1 });
  return successResponse(res, 'Inventories retrieved', inventories);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const item = await Item.findById(req.body.item);
  if (!item) return errorResponse(res, 'Item not found', [], 404);

  const inventory = await Inventory.create({ ...req.body, status: 'LOGGED_TO_STOCKS' });
  const balance = item.quantityOnHand + inventory.quantity;
  await Item.findByIdAndUpdate(item._id, { quantityOnHand: balance });
  await LedgerTransaction.create({
    inventory: inventory._id,
    type: 'incoming',
    quantity: inventory.quantity,
    reference: 'Initial Receipt',
    description: 'Initial inventory receipt',
    runningBalance: balance,
  });

  return successResponse(res, 'Inventory created', inventory, 201);
});

module.exports = router;
