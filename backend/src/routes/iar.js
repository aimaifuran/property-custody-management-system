const express = require('express');
const { body, validationResult } = require('express-validator');
const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canViewIAR'), async (req, res) => {
  const iar = await InspectionAcceptanceReport.find({ deleted: false }).populate('supplier').sort({ createdAt: -1 });
  return successResponse(res, 'IAR retrieved', iar);
});

router.post('/', authenticate, authorize('canManageIAR'), [
  body('iarNumber').notEmpty().withMessage('IAR number is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const report = await InspectionAcceptanceReport.create(req.body);
  for (const entry of report.items) {
    const item = await Item.findOne({ stockNumber: entry.stockNumber });
    if (item) {
      const inventory = await Inventory.create({
        item: item._id,
        serialNumber: entry.serialNumber,
        propertyNumber: entry.propertyNumber,
        quantity: entry.quantity,
        unitCost: entry.unitCost,
        assetCost: entry.totalCost,
        status: 'LOGGED_TO_STOCKS',
        supplier: report.supplier,
        purchaseDate: report.purchaseDate,
        inspectionAcceptanceReport: report._id,
      });
      const newBalance = item.quantityOnHand + entry.quantity;
      await Item.findByIdAndUpdate(item._id, { quantityOnHand: newBalance });
      await LedgerTransaction.create({
        inventory: inventory._id,
        type: 'incoming',
        quantity: entry.quantity,
        reference: report.iarNumber,
        description: 'IAR acceptance',
        runningBalance: newBalance,
      });
    }
  }
  report.status = 'LOGGED_TO_STOCKS';
  await report.save();
  return successResponse(res, 'IAR created', report, 201);
});

module.exports = router;
