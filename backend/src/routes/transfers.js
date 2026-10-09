const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const { reserveDocumentNumber } = require('../utils/documentNumber');
const router = express.Router();

const PTR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'fromAccountableOfficer', 'toAccountableOfficer', 'ptrNumber',
  'transferType', 'remarks', 'reasonForTransfer',
  'approvedBy.name', 'approvedBy.designation',
  'issuedBy.name', 'issuedBy.designation',
  'receivedBy.name', 'receivedBy.designation',
];

router.get('/', authenticate, authorize(['canViewRIS', 'canViewDashboard', 'canManageInventory']), async (req, res) => {
  const reports = await listRecords(PropertyTransferReport, req, { baseFilter: { deleted: false, ...(req.user.role === 'admin' ? {} : { $or: [{ fromUser: req.user._id }, { toUser: req.user._id }] }) }, searchFields: PTR_SEARCH_FIELDS });
  return successResponse(res, 'PTR retrieved', reports);
});

router.post('/', authenticate, validateAdminForm('ptr'), authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  delete payload.lastEditedAt;
  if (payload.autoNumber === true || !String(payload.ptrNumber || '').trim()) payload.ptrNumber = await reserveDocumentNumber(PropertyTransferReport, 'ptrNumber');
  delete payload.autoNumber;
  for (const key of ['fromUser', 'toUser', 'receiverConfirmedAt', 'rejectionReason']) delete payload[key];
  payload.status = 'RECORDED';
  const report = await PropertyTransferReport.create(payload);

  await ActivityLog.create({
    user: req.user._id,
    action: 'PTR created',
    details: `PTR ${report.ptrNumber} created`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'PTR created', report, 201);
});

router.put('/:id', authenticate, validateAdminForm('ptr'), authorize('canManageInventory'), async (req, res) => {
  const existing = await PropertyTransferReport.findOne({ _id: req.params.id, deleted: false });
  if (existing?.fromUser) return errorResponse(res, 'Use the receiver confirmation and admin approval actions for a transfer request', [], 409);
  const payload = { ...req.body, lastEditedAt: new Date() };
  for (const key of ['fromUser', 'toUser', 'status', 'receiverConfirmedAt', 'rejectionReason']) delete payload[key];
  const report = await PropertyTransferReport.findOneAndUpdate(
    { _id: req.params.id, deleted: false },
    payload,
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
