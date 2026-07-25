const express = require('express');
const { body, validationResult } = require('express-validator');
const PropertyTransferReport = require('../models/PropertyTransferReport');
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
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const report = await PropertyTransferReport.create(req.body);

  await ActivityLog.create({
    user: req.user._id,
    action: 'PTR created',
    details: `PTR ${report.ptrNumber} created`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PTR created', report, 201);
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const report = await PropertyTransferReport.findOneAndUpdate(
    { _id: req.params.id, deleted: false },
    req.body,
    { new: true, runValidators: true },
  );
  if (!report) return errorResponse(res, 'PTR not found', [], 404);

  await ActivityLog.create({
    user: req.user._id,
    action: 'PTR updated',
    details: `PTR ${report.ptrNumber} updated`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PTR updated', report);
});

module.exports = router;
