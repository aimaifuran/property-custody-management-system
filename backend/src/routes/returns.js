const express = require('express');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const ReturnedSupply = require('../models/ReturnedSupply');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const { paginateAndSearch } = require('../utils/paginate');

const router = express.Router();

const PRS_SEARCH_FIELDS = [
  'lguName', 'purpose', 'note',
  'returnedBy.name', 'returnedBy.designation',
  'returnedTo.name', 'returnedTo.designation',
];

router.get('/', authenticate, authorize('canViewDashboard'), async (req, res) => {
  const { data, pagination } = await paginateAndSearch(PropertyReturnSlip, req, {
    baseFilter: { deleted: false },
    searchFields: PRS_SEARCH_FIELDS,
  });
  return successResponse(res, 'PRS retrieved', { items: data, pagination });
});

router.post('/', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  payload.items = (payload.items || []).map((entry) => ({
    ...entry,
    totalValue: Number(entry.quantity || 0) * Number(entry.unitValue || 0),
  }));

  const report = await PropertyReturnSlip.create(payload);

  await ReturnedSupply.insertMany(report.items.map((entry) => ({
    prs: report._id,
    lguName: report.lguName,
    purpose: report.purpose,
    quantity: entry.quantity,
    unit: entry.unit,
    description: entry.description,
    propertyNumber: entry.propertyNumber,
    mrNumber: entry.mrNumber,
    unitValue: entry.unitValue,
    totalValue: entry.totalValue,
    note: report.note,
    returnedBy: report.returnedBy,
    returnedTo: report.returnedTo,
  })));

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS created',
    details: `PRS created for ${report.lguName || 'LGU'}; ${report.items.length} item(s) logged to Returned Supply`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS created', report, 201);
});

router.put('/:id', authenticate, authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  if (payload.items) {
    payload.items = payload.items.map((entry) => ({
      ...entry,
      totalValue: Number(entry.quantity || 0) * Number(entry.unitValue || 0),
    }));
  }
  const report = await PropertyReturnSlip.findOneAndUpdate(
    { _id: req.params.id, deleted: false },
    payload,
    { new: true, runValidators: true },
  );
  if (!report) return errorResponse(res, 'PRS not found', [], 404);

  await ActivityLog.create({
    user: req.user._id,
    action: 'PRS updated',
    details: `PRS ${report._id} updated`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PRS updated', report);
});

module.exports = router;
