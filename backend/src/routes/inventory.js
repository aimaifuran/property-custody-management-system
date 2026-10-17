const express = require('express');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize(['canViewDashboard', 'canManageInventory']), async (req, res) => {
  const inventories = await Inventory.find({ deleted: false }).populate('item').populate('supplier').populate('accountability').sort({ createdAt: -1 });
  return successResponse(res, 'Inventories retrieved', inventories);
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const quantity = Number(req.body.quantity), unitCost = Number(req.body.unitCost || 0);
  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return errorResponse(res, 'Enter a positive whole quantity and valid unit cost', [], 400);
  let inventory;
  try {
    inventory = await require('mongoose').connection.transaction(async session => {
      const item = await Item.findOneAndUpdate({ _id: req.body.item, deleted: false }, { $inc: { quantityOnHand: quantity } }, { returnDocument: 'after', session });
      if (!item) throw new Error('Item not found');
      const [created] = await Inventory.create([{ item: item._id, quantity, unitCost, assetCost: quantity * unitCost, serialNumber: req.body.serialNumber, propertyNumber: req.body.propertyNumber, supplier: req.body.supplier, purchaseDate: req.body.purchaseDate, status: 'LOGGED_TO_STOCKS' }], { session });
      if (created.serialNumber && quantity !== 1) throw new Error('Use quantity 1 for a serialized asset');
      await LedgerTransaction.create([{ inventory: created._id, postedBy: req.user._id, type: 'incoming', quantity, reference: 'Initial Receipt', description: 'Initial inventory receipt', runningBalance: item.quantityOnHand }], { session });
      await require('../models/ActivityLog').create([{ user: req.user._id, action: 'Inventory receipt posted', details: `${item.stockNumber}: ${quantity}`, ipAddress: req.ip, browser: req.get('user-agent') }], { session });
      return created;
    });
  } catch (error) { return errorResponse(res, error.message, [], 400); }

  return successResponse(res, 'Inventory created', inventory, 201);
});

module.exports = router;
