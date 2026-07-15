const express = require('express');
const { body, validationResult } = require('express-validator');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const PropertyAccountability = require('../models/PropertyAccountability');
const Inventory = require('../models/Inventory');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const reports = await PropertyReturnSlip.find({ deleted: false }).sort({ createdAt: -1 });
  return successResponse(res, 'PRS retrieved', reports);
});

router.post('/', authenticate, authorize('canManageInventory'), [
  body('prsNumber').notEmpty().withMessage('PRS number is required'),
  body('accountability').notEmpty().withMessage('Accountability is required'),
  body('condition').notEmpty().withMessage('Condition is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const report = await PropertyReturnSlip.create({
    ...req.body,
    status: 'PENDING_RETURN',
    returnDate: req.body.returnDate || new Date(),
    serviceable: req.body.serviceable !== undefined ? req.body.serviceable : true,
  });

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS created',
    details: `PRS ${report.prsNumber} created`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS created', report, 201);
});

router.post('/:id/accept', authenticate, authorize('canManageInventory'), async (req, res) => {
  const report = await PropertyReturnSlip.findById(req.params.id);
  if (!report || report.deleted) return errorResponse(res, 'PRS not found', [], 404);
  if (report.status !== 'PENDING_RETURN') return errorResponse(res, 'PRS is not pending return', [], 400);

  const accountability = await PropertyAccountability.findById(report.accountability);
  if (!accountability) return errorResponse(res, 'Accountability not found', [], 404);

  const inventory = await Inventory.findById(accountability.inventory);
  if (!inventory || inventory.deleted) return errorResponse(res, 'Inventory not found', [], 404);

  accountability.active = false;
  await accountability.save();

  inventory.accountability = null;
  inventory.status = report.serviceable ? 'IN_STORAGE_AVAILABLE' : 'IN_STORAGE_UNSERVICEABLE';
  await inventory.save();

  report.status = report.serviceable ? 'RETURNED' : 'RETURNED_UNSERVICEABLE';
  await report.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS accepted',
    details: `PRS ${report.prsNumber} accepted with status ${report.status}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS accepted', report);
});

module.exports = router;
