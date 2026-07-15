const express = require('express');
const { body, validationResult } = require('express-validator');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const Inventory = require('../models/Inventory');
const PropertyAccountability = require('../models/PropertyAccountability');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const reports = await PropertyTransferReport.find({ deleted: false }).sort({ createdAt: -1 });
  return successResponse(res, 'PTR retrieved', reports);
});

router.post('/', authenticate, authorize('canManageInventory'), [
  body('ptrNumber').notEmpty().withMessage('PTR number is required'),
  body('inventory').notEmpty().withMessage('Inventory is required'),
  body('oldAccountableOfficer').notEmpty().withMessage('Old accountable officer is required'),
  body('newAccountableOfficer').notEmpty().withMessage('New accountable officer is required'),
  body('reason').notEmpty().withMessage('Reason is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const report = await PropertyTransferReport.create({
    ...req.body,
    status: 'PENDING_TRANSFER',
    transferDate: req.body.transferDate || new Date(),
  });

  await ActivityLog.create({
    user: req.user._id,
    action: 'PTR created',
    details: `PTR ${report.ptrNumber} created`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PTR created', report, 201);
});

router.post('/:id/approve', authenticate, authorize('canManageInventory'), async (req, res) => {
  const report = await PropertyTransferReport.findById(req.params.id);
  if (!report || report.deleted) return errorResponse(res, 'PTR not found', [], 404);
  if (report.status !== 'PENDING_TRANSFER') return errorResponse(res, 'PTR is not pending transfer', [], 400);

  const inventory = await Inventory.findById(report.inventory);
  if (!inventory || inventory.deleted) return errorResponse(res, 'Inventory not found', [], 404);

  const accountability = await PropertyAccountability.findById(inventory.accountability);
  if (accountability) {
    accountability.employee = report.newAccountableOfficer;
    accountability.active = true;
    await accountability.save();
  }

  inventory.status = 'TRANSFERRED';
  await inventory.save();

  report.status = 'TRANSFERRED';
  await report.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'PTR approved',
    details: `PTR ${report.ptrNumber} transferred to ${report.newAccountableOfficer}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PTR approved', report);
});

module.exports = router;
