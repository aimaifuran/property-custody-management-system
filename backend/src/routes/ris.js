const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');
const LedgerTransaction = require('../models/LedgerTransaction');
const PropertyAccountability = require('../models/PropertyAccountability');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

const getUserLabel = (user) => {
  const name = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || user.email || 'System User';
};

const createSignatureHash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const canReviewRis = (user) => (
  user?.role === 'admin'
  || (user?.office || '').toLowerCase().includes('supply')
  || user?.permissions?.includes('canReviewRIS')
);

const getDocumentNumber = async (formType, createdAt, cache) => {
  const year = createdAt.getFullYear();
  const cacheKey = `${formType}:${year}`;

  if (cache[cacheKey] == null) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    cache[cacheKey] = await PropertyAccountability.countDocuments({
      formType,
      createdAt: { $gte: start, $lt: end },
    });
  }

  cache[cacheKey] += 1;
  return `${formType}-${year}-MM-${String(cache[cacheKey]).padStart(4, '0')}`;
};

router.get('/', authenticate, authorize('canViewRIS'), async (req, res) => {
  const ris = await RequisitionIssueSlip.find({ deleted: false }).sort({ createdAt: -1 });
  return successResponse(res, 'RIS retrieved', ris);
});

router.post('/', authenticate, authorize(['canCreateRIS', 'canManageRIS']), [
  body('risNumber').notEmpty().withMessage('RIS number is required'),
  body('entityName').notEmpty().withMessage('Entity name is required'),
  body('fundCluster').notEmpty().withMessage('Fund cluster is required'),
  body('division').notEmpty().withMessage('Division is required'),
  body('office').notEmpty().withMessage('Office is required'),
  body('responsibilityCenterCode').notEmpty().withMessage('Responsibility center code is required'),
  body('requestedBy').notEmpty().withMessage('Requested by is required'),
  body('receivedBy').notEmpty().withMessage('Received by is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const ris = await RequisitionIssueSlip.create({
    ...req.body,
    status: 'PENDING_REVIEW',
  });

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS created',
    details: `RIS ${ris.risNumber} created with pending approval status`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS created', ris, 201);
});

router.post('/:id/review', authenticate, async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (!['PENDING_REVIEW', 'PENDING_APPROVAL', 'REVIEWED'].includes(ris.status)) {
    return errorResponse(res, 'RIS cannot be reviewed in its current state', [], 400);
  }

  const stockLookup = await Item.find({ deleted: false });
  const stockMap = new Map(stockLookup.map((entry) => [entry.stockNumber, entry]));

  ris.items = (req.body.items || ris.items).map((entry) => {
    const requested = Number(entry.quantityRequested || 0);
    const inventoryItem = stockMap.get(entry.stockNumber);
    const available = Number(inventoryItem?.quantityOnHand || 0);
    const issued = Math.min(requested, available);
    const systemRemarks = available <= 0
      ? 'Out of Stock - For Procurement'
      : issued < requested
        ? `[System: Deficit of ${requested - issued} units - Split workflow initiated]`
        : 'Fully Issued';

    return {
      ...entry,
      stockAvailable: available,
      isAvailable: available > 0,
      quantityIssued: issued,
      remarks: entry.remarks || systemRemarks,
    };
  });

  ris.status = 'REVIEWED';
  ris.reviewedBy = getUserLabel(req.user);
  ris.reviewedAt = new Date();
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS reviewed',
    details: `RIS ${ris.risNumber} reviewed by supply officer`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS reviewed', ris);
});

router.post('/:id/approve', authenticate, async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (!['REVIEWED', 'PENDING_APPROVAL'].includes(ris.status)) return errorResponse(res, 'RIS is not ready for approval', [], 400);

  const approver = getUserLabel(req.user);
  ris.status = 'APPROVED';
  ris.approvedBy = approver;
  ris.approvedAt = new Date();
  ris.signatureHash = createSignatureHash({ risId: ris._id.toString(), action: 'APPROVED', userId: req.user._id.toString(), at: Date.now() });
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS approved',
    details: `RIS ${ris.risNumber} approved by ${approver}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS approved', ris);
});

router.post('/:id/reject', authenticate, [
  body('rejectionReason').notEmpty().withMessage('Rejection reason is required'),
], async (req, res) => {
  if (!canReviewRis(req.user)) return errorResponse(res, 'Forbidden', [], 403);
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) return errorResponse(res, 'RIS not found', [], 404);
  if (ris.status !== 'PENDING_APPROVAL') return errorResponse(res, 'RIS is not pending approval', [], 400);

  const rejecter = getUserLabel(req.user);
  ris.status = 'REJECTED';
  ris.rejectionReason = req.body.rejectionReason;
  ris.rejectedBy = rejecter;
  ris.rejectedAt = new Date();
  ris.signatureHash = createSignatureHash({ risId: ris._id.toString(), action: 'REJECTED', userId: req.user._id.toString(), reason: req.body.rejectionReason, at: Date.now() });
  await ris.save();

  await ActivityLog.create({
    user: req.user._id,
    action: 'RIS rejected',
    details: `RIS ${ris.risNumber} rejected by ${rejecter}: ${req.body.rejectionReason}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'RIS rejected', ris);
});

router.post('/:id/issue', authenticate, async (req, res) => {
  try {
  if (!canReviewRis(req.user)) {
    return errorResponse(res, 'Forbidden', [], 403);
  }
  const ris = await RequisitionIssueSlip.findById(req.params.id);
  if (!ris || ris.deleted) {
    return errorResponse(res, 'RIS not found', [], 404);
  }
    if (!['APPROVED', 'REVIEWED'].includes(ris.status)) {
      return errorResponse(res, 'RIS must be approved before issuance', [], 400);
    }

    const issuedAt = new Date();
    const issuedBy = getUserLabel(req.user);
    const docCounters = {};
    const createdAccountabilities = [];

    for (const entry of ris.items) {
      const quantityRequested = Number(entry.quantityRequested || 0);
      const quantityIssued = Number(entry.quantityIssued || quantityRequested);
      if (quantityIssued < 0) {
        return errorResponse(res, `Invalid quantity for ${entry.stockNumber || entry.description || 'item'}`, [], 400);
      }
      if (quantityIssued === 0) {
        continue;
      }

      const item = await Item.findOne({ stockNumber: entry.stockNumber, deleted: false });
      if (!item) {
        return errorResponse(res, `Stock number "${entry.stockNumber}" was not found in Property Card inventory. Please select a valid stock number.`, [], 404);
      }
      if (quantityIssued > item.quantityOnHand) {
        return errorResponse(
          res,
          `Insufficient stock available to fulfill this request. Available: ${item.quantityOnHand}, Requested: ${quantityIssued}.`,
          [],
          400,
        );
      }

      const inventory = await Inventory.findOne({ item: item._id, deleted: false }).sort({ createdAt: -1 });
      if (!inventory) {
        return errorResponse(res, `Inventory record not found for ${entry.stockNumber}`, [], 404);
      }

      item.quantityOnHand -= quantityIssued;
      item.status = item.quantityOnHand > 0 ? 'IN_STORAGE' : 'ISSUED';
      await item.save();

      const unitCost = Number(inventory.unitCost || item.cost || 0);
      const formType = unitCost < 50000 ? 'ICS' : 'PAR';
      const documentNumber = await getDocumentNumber(formType, issuedAt, docCounters);

      const accountability = await PropertyAccountability.create({
        inventory: inventory._id,
        employee: ris.receivedBy || ris.requestedBy,
        office: ris.office,
        serialNumber: inventory.serialNumber || entry.stockNumber,
        propertyNumber: inventory.propertyNumber || '',
        issueDate: issuedAt,
        condition: 'Serviceable',
        remarks: entry.remarks || ris.purpose || entry.description,
        formType,
        documentNumber,
        signatureHash: createSignatureHash({
          risId: ris._id.toString(),
          inventoryId: inventory._id.toString(),
          documentNumber,
          userId: req.user._id.toString(),
          issuedAt: issuedAt.toISOString(),
        }),
        active: true,
      });

      inventory.accountability = accountability._id;
      inventory.status = 'ACTIVE_IN_USE';
      await inventory.save();

      await LedgerTransaction.create({
        inventory: inventory._id,
        type: 'outgoing',
        quantity: quantityIssued,
        reference: ris.risNumber,
        description: `RIS issuance - ${formType} ${documentNumber}`,
        runningBalance: item.quantityOnHand,
      });

      createdAccountabilities.push({
        formType,
        documentNumber,
        stockNumber: entry.stockNumber,
        quantityIssued,
      });
    }

    ris.status = 'ACCOUNTABILITY_LOCKED';
    ris.issuedAt = issuedAt;
    ris.issuedBy = issuedBy;
    ris.signatureHash = createSignatureHash({
      risId: ris._id.toString(),
      action: 'ISSUED',
      userId: req.user._id.toString(),
      at: issuedAt.toISOString(),
    });
    await ris.save();

    await ActivityLog.create({
      user: req.user._id,
      action: 'RIS issued',
      details: `RIS ${ris.risNumber} issued; ${createdAccountabilities.length} accountability record(s) created`,
      ipAddress: req.ip,
      browser: req.get('user-agent'),
    });

    return successResponse(res, 'RIS issued and accountability locked', {
      ris,
      accountabilities: createdAccountabilities,
    });
  } catch (error) {
    return errorResponse(res, error.message || 'Unable to issue RIS', [], 400);
  }
});

module.exports = router;
