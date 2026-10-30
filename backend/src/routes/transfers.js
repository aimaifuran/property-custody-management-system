const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const PropertyTransferReport = require('../models/PropertyTransferReport');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');

const { listRecords } = require('../utils/paginate');
const { reserveDocumentNumber } = require('../utils/documentNumber');
const router = express.Router();
const mongoose = require('mongoose');
const syncTransferCard = require('../utils/syncTransferCard');
const Accountability = require('../models/PropertyAccountability');
const User = require('../models/User');
const PropertyReturnSlip = require('../models/PropertyReturnSlip');
const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
const Inventory = require('../models/Inventory');
const { accountName } = require('../utils/accountLinks');
const { notifyUsers, notifyAdmins } = require('../utils/workflowNotifications');
const reassignAccountability = require('../utils/reassignAccountability');

const resolveReturnSlipItem = async (returnSlipId, returnSlipItemId, session = null) => {
  const slip = await PropertyReturnSlip.findOne({
    _id: returnSlipId,
    deleted: false,
    status: 'RETURNED',
    stockPosted: true,
  }).session(session);
  const line = slip?.items.id(returnSlipItemId);
  if (!slip || !line) throw Object.assign(new Error('The saved PRS item is unavailable'), { status: 404 });

  const [accountability, ris, returnedBy] = await Promise.all([
    line.accountability ? Accountability.findById(line.accountability).populate('inventory').session(session) : null,
    line.ris ? RequisitionIssueSlip.findById(line.ris).session(session) : null,
    slip.returnedBy?.user ? User.findById(slip.returnedBy.user).session(session) : null,
  ]);
  const issuedLine = ris?.items.id(line.risItem);
  const inventoryId = accountability?.inventory?._id || issuedLine?.inventory;
  const inventory = inventoryId
    ? await Inventory.findOne({ _id: inventoryId, deleted: false }).populate('item').session(session)
    : null;
  const fromAccountableOfficer = slip.returnedBy?.name || (returnedBy && accountName(returnedBy));
  if (!fromAccountableOfficer) throw Object.assign(new Error('The PRS does not identify its returning accountable officer'), { status: 400 });

  const assigned = inventory && (inventory.serialNumber || inventory.quantity === 1)
    ? await Accountability.exists({ inventory: inventory._id, deleted: false, active: true }).session(session)
    : false;
  const availableForTransfer = !!inventory?.item && !inventory.item.deleted
    && (line.condition || 'Serviceable') === 'Serviceable'
    && Number(inventory.item.quantityOnHand || 0) >= Number(line.quantity || 0) && !assigned;

  return {
    availableForTransfer,
    slip,
    fromAccountableOfficer,
    fundCluster: ris?.fundCluster || issuedLine?.fundCluster || 'General Fund',
    item: {
      returnSlip: slip._id,
      returnSlipItem: line._id,
      inventory: inventory?._id,
      property: inventory?.property,
      serialNumber: inventory?.serialNumber || '',
      dateAcquired: inventory?.purchaseDate || slip.returnedAt || slip.updatedAt,
      propertyNumber: line.propertyNumber || accountability?.propertyNumber || inventory?.propertyNumber || issuedLine?.stockNumber || '',
      itemName: inventory?.item?.name || issuedLine?.itemName ||
        (inventory?.item?.category !== 'General' ? inventory?.item?.category : '') ||
        issuedLine?.description || inventory?.item?.description || line.description || '',
      description: line.description || issuedLine?.description || inventory?.item?.description || '',
      quantity: Number(line.quantity || 0),
      amount: Number(line.totalValue ?? Number(line.quantity || 0) * Number(line.unitValue || 0)),
      condition: line.condition || 'Serviceable',
    },
  };
};

const resolveReturnSlipDocument = async (items, recipientId, session, excludeReportId) => {
  if (!Array.isArray(items) || items.length !== 1 || !items[0]?.returnSlip || !items[0]?.returnSlipItem) {
    throw Object.assign(new Error('Select one saved PRS item for this PTR document'), { status: 400 });
  }
  if (!mongoose.isValidObjectId(recipientId)) throw Object.assign(new Error('Search and select a new accountable officer'), { status: 400 });
  const recipient = await User.findOne({ _id: recipientId, role: 'user', status: 'active', deleted: false }).session(session);
  if (!recipient) throw Object.assign(new Error('The selected new accountable officer is unavailable'), { status: 400 });

  const resolved = await resolveReturnSlipItem(items[0].returnSlip, items[0].returnSlipItem, session);
  if (!resolved.availableForTransfer && !excludeReportId) throw Object.assign(new Error('This PRS item is no longer available for transfer'), { status: 409, code: 'TRANSFER_SOURCE_UNAVAILABLE' });
  const duplicate = await PropertyTransferReport.exists({
    deleted: false,
    ...(excludeReportId ? { _id: { $ne: excludeReportId } } : {}),
    items: { $elemMatch: { returnSlip: resolved.slip._id, returnSlipItem: resolved.item.returnSlipItem } },
  }).session(session);
  if (duplicate) throw Object.assign(new Error('A PTR document already exists for this PRS item'), { status: 409 });

  return {
    fromAccountableOfficer: resolved.fromAccountableOfficer,
    toAccountableOfficer: accountName(recipient),
    fromUser: resolved.slip.returnedBy?.user || resolved.slip.submittedBy,
    toUser: recipient._id,
    fundCluster: resolved.fundCluster,
    items: [{ ...resolved.item, dateAcquired: items[0].dateAcquired || resolved.item.dateAcquired }],
  };
};

const resolveIssuedItems = async (items, session) => {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Select at least one issued item for the PTR'), { status: 400 });
  const ids = items.map(item => String(item.accountability || ''));
  if (ids.some(id => !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) {
    throw Object.assign(new Error('Select each issued item from the current accountability list'), { status: 400 });
  }
  const accountabilities = await Accountability.find({
    _id: { $in: ids },
    active: true,
    deleted: false,
    user: { $ne: null },
    acceptedAt: { $ne: null },
    pendingMovement: { $in: [null, ''] },
  }).populate({ path: 'inventory', populate: { path: 'item' } }).session(session);
  const byId = new Map(accountabilities.map(row => [String(row._id), row]));
  const rows = ids.map(id => byId.get(id));
  if (rows.some(row => !row || !row.inventory?.item || Number(row.quantity || 0) <= Number(row.returnedQuantity || 0))) {
    throw Object.assign(new Error('PTR items must be issued, accepted, and still held by a user'), { status: 400 });
  }
  const ownerIds = [...new Set(rows.map(row => String(row.user)))];
  if (ownerIds.length !== 1) {
    throw Object.assign(new Error('A PTR can only include items held by the same accountable officer'), { status: 400 });
  }
  const activeOwner = await User.exists({ _id: ownerIds[0], role: 'user', status: 'active', deleted: false }).session(session);
  if (!activeOwner) throw Object.assign(new Error('PTR items must be assigned to an active user'), { status: 400 });
  return {
    fromAccountableOfficer: rows[0].employee,
    fromUser: rows[0].user,
    accountabilities: rows,
    items: items.map((item, index) => {
      const row = rows[index];
      const remaining = Number(row.quantity || 0) - Number(row.returnedQuantity || 0);
      return {
        ...item,
        quantity: remaining,
        accountability: row._id,
        inventory: row.inventory._id,
        property: row.inventory.property,
        serialNumber: row.serialNumber || row.inventory.serialNumber,
        dateAcquired: item.dateAcquired || row.inventory.purchaseDate,
        propertyNumber: row.propertyNumber || row.inventory.propertyNumber || row.inventory.item.stockNumber,
        itemName: row.inventory.item.name || '',
        description: row.inventory.item.description,
        amount: remaining * Number(row.inventory.unitCost || 0),
        condition: row.condition || 'Serviceable',
      };
    }),
  };
};

const sameItems = (current, submitted) => {
  const dateValue = value => {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
  };
  const fields = ['accountability', 'inventory', 'property', 'serialNumber', 'propertyNumber', 'description', 'amount', 'condition'];
  return Array.isArray(submitted) && current.length === submitted.length && current.every((row, index) =>
    fields.every(field => String(row[field] || '') === String(submitted[index][field] || '')) &&
    dateValue(row.dateAcquired) === dateValue(submitted[index].dateAcquired));
};

const PTR_SEARCH_FIELDS = [
  'entityName', 'fundCluster', 'fromAccountableOfficer', 'toAccountableOfficer', 'ptrNumber',
  'transferType', 'remarks', 'reasonForTransfer',
  'approvedBy.name', 'approvedBy.designation',
  'issuedBy.name', 'issuedBy.designation',
  'receivedBy.name', 'receivedBy.designation',
];

router.get('/return-item-drafts', authenticate, authorize('canManageInventory'), async (req, res) => {
  const [slips, savedReports] = await Promise.all([
    PropertyReturnSlip.find({ deleted: false, status: 'RETURNED', stockPosted: true }).sort({ returnedAt: -1, createdAt: -1 }).lean(),
    PropertyTransferReport.find({ deleted: false, 'items.returnSlip': { $ne: null } }).select('items.returnSlip items.returnSlipItem').lean(),
  ]);
  const alreadyDrafted = new Set(savedReports.flatMap(report => report.items.map(item => `${item.returnSlip}:${item.returnSlipItem}`)));
  const drafts = [];
  for (const slip of slips) {
    for (const line of slip.items) {
      const key = `${slip._id}:${line._id}`;
      if (alreadyDrafted.has(key)) continue;
      const resolved = await resolveReturnSlipItem(slip._id, line._id);
      if (!resolved.availableForTransfer) continue;
      drafts.push({
        _id: key,
        prsNumber: slip.prsNumber || '',
        createdAt: slip.returnedAt || slip.createdAt,
        lguName: slip.lguName || '',
        returnedBy: slip.returnedBy,
        fromAccountableOfficer: resolved.fromAccountableOfficer,
        fundCluster: resolved.fundCluster,
        item: resolved.item,
      });
    }
  }
  return successResponse(res, 'Saved PRS items available for PTR drafts', drafts);
});

router.get('/', authenticate, authorize(['canViewRIS', 'canViewDashboard', 'canManageInventory']), async (req, res) => {
  const reports = await listRecords(PropertyTransferReport, req, {
    baseFilter: { deleted: false, ...(req.user.role === 'admin' ? {} : { $or: [{ fromUser: req.user._id }, { toUser: req.user._id }] }) },
    searchFields: PTR_SEARCH_FIELDS,
    populate: { path: 'items.inventory', populate: { path: 'item' } },
  });
  return successResponse(res, 'PTR retrieved', reports);
});

router.post('/', authenticate, validateAdminForm('ptr'), authorize('canManageInventory'), async (req, res) => {
  const payload = { ...req.body };
  const returnSlipRecipient = payload.toUser;
  const isReturnSlipDocument = Array.isArray(payload.items) && payload.items.some(item => item.returnSlip || item.returnSlipItem);
  const assignNumber = payload.autoNumber === true || !String(payload.ptrNumber || '').trim();
  delete payload.lastEditedAt;
  delete payload.autoNumber;
  for (const key of ['fromUser', 'toUser', 'receiverConfirmedAt', 'rejectionReason']) delete payload[key];
  payload.status = 'RECORDED';
  let report;
  try {
    report = await mongoose.connection.transaction(async session => {
      let sourceAccountabilities = [];
      if (isReturnSlipDocument) {
        const resolved = await resolveReturnSlipDocument(payload.items, returnSlipRecipient, session);
        payload.items = resolved.items;
        payload.fromAccountableOfficer = resolved.fromAccountableOfficer;
        payload.toAccountableOfficer = resolved.toAccountableOfficer;
        payload.toUser = resolved.toUser;
        payload.fromUser = resolved.fromUser;
        payload.fundCluster = payload.fundCluster || resolved.fundCluster;
      } else {
        const resolved = await resolveIssuedItems(payload.items, session);
        if (!mongoose.isValidObjectId(returnSlipRecipient)) throw Object.assign(new Error('Search and select a new accountable officer'), { status: 400 });
        const receiver = await User.findOne({ _id: returnSlipRecipient, role: 'user', status: 'active', deleted: false }).session(session);
        if (!receiver || String(receiver._id) === String(resolved.fromUser)) {
          throw Object.assign(new Error('Select a different active receiving accountable officer'), { status: 400 });
        }
        payload.items = resolved.items;
        payload.fromAccountableOfficer = resolved.fromAccountableOfficer;
        payload.fromUser = resolved.fromUser;
        payload.toUser = receiver._id;
        payload.toAccountableOfficer = accountName(receiver);
        sourceAccountabilities = resolved.accountabilities;
      }
      if (assignNumber) payload.ptrNumber = await reserveDocumentNumber(PropertyTransferReport, 'ptrNumber', new Date(), session);
      const [created] = await PropertyTransferReport.create([payload], { session });
      if (isReturnSlipDocument) await require('../utils/issueReturnedTransfer')(created, req.user, session);
      if (!isReturnSlipDocument) {
        const receiver = await User.findById(created.toUser).session(session);
        const date = created.date || new Date();
        const acceptedAt = created.receivedBy?.date || date;
        for (const [index, entry] of created.items.entries()) {
          const row = sourceAccountabilities[index];
          if (!row || String(row.user) !== String(created.fromUser) || !row.inventory) {
            throw Object.assign(new Error('The current accountability has changed'), { status: 409 });
          }
          await reassignAccountability({
            row,
            receiver,
            report: created,
            entry,
            actor: req.user,
            session,
            date,
            acceptedAt,
          });
        }
        await syncTransferCard(created, session);
      }
      await notifyUsers([created.fromUser, created.toUser], 'PTR recorded', `${created.ptrNumber}: ${created.fromAccountableOfficer} to ${created.toAccountableOfficer}.`, '/transfers', session);
      await notifyAdmins('PTR recorded', `${created.ptrNumber}: ${created.fromAccountableOfficer} to ${created.toAccountableOfficer}.`, '/users', session);
      return created;
    });
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.code ? [{ code: error.code }] : [], error.status);
    throw error;
  }

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
  if (existing?.fromUser && existing.status !== 'RECORDED') return errorResponse(res, 'Use the receiver confirmation and admin approval actions for a transfer request', [], 409);
  const payload = { ...req.body, lastEditedAt: new Date() };
  const returnSlipRecipient = payload.toUser;
  const isReturnSlipDocument = Array.isArray(payload.items) && payload.items.some(item => item.returnSlip || item.returnSlipItem);
  for (const key of ['fromUser', 'toUser', 'status', 'receiverConfirmedAt', 'rejectionReason']) delete payload[key];
  let report;
  try {
    report = await mongoose.connection.transaction(async session => {
      if (isReturnSlipDocument && existing?.items.some(item => item.returnSlip && item.accountability)) {
        if (String(returnSlipRecipient) !== String(existing.toUser) || !sameItems(existing.items, payload.items)) {
          throw Object.assign(new Error('Issued transfer items and recipient cannot be changed; use the return workflow'), { status: 409 });
        }
        payload.items = existing.items;
        payload.fromUser = existing.fromUser;
        payload.toUser = existing.toUser;
        payload.fromAccountableOfficer = existing.fromAccountableOfficer;
        payload.toAccountableOfficer = existing.toAccountableOfficer;
      } else if (isReturnSlipDocument) {
        const resolved = await resolveReturnSlipDocument(payload.items, returnSlipRecipient, session, existing?._id);
        payload.items = resolved.items;
        payload.fromAccountableOfficer = resolved.fromAccountableOfficer;
        payload.toAccountableOfficer = resolved.toAccountableOfficer;
        payload.toUser = resolved.toUser;
        payload.fromUser = resolved.fromUser;
        payload.fundCluster = payload.fundCluster || resolved.fundCluster;
      } else if (existing?.fromUser && existing.status === 'RECORDED') {
        if (!sameItems(existing.items, payload.items)) {
          throw Object.assign(new Error('Transferred PTR items cannot be changed'), { status: 400 });
        }
        payload.items = existing.items;
        payload.fromUser = existing.fromUser;
        payload.toUser = existing.toUser;
        payload.fromAccountableOfficer = existing.fromAccountableOfficer;
        payload.toAccountableOfficer = existing.toAccountableOfficer;
      } else if (payload.items) {
        if (payload.items.some(item => item.accountability)) {
          const resolved = await resolveIssuedItems(payload.items, session);
          payload.items = resolved.items;
          payload.fromAccountableOfficer = resolved.fromAccountableOfficer;
        } else if (!existing || !sameItems(existing.items, payload.items)) {
          throw Object.assign(new Error('PTR items must be selected from issued items'), { status: 400 });
        }
      }
      const updated = await PropertyTransferReport.findOneAndUpdate(
        { _id: req.params.id, deleted: false }, payload, { returnDocument: 'after', runValidators: true, session },
      );
      if (updated && !isReturnSlipDocument) await syncTransferCard(updated, session);
      if (updated) {
        await notifyUsers([updated.fromUser, updated.toUser], 'PTR updated', `${updated.ptrNumber}: transfer details updated.`, '/transfers', session);
        await notifyAdmins('PTR updated', `${updated.ptrNumber}: transfer details updated.`, '/users', session);
      }
      return updated;
    });
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.code ? [{ code: error.code }] : [], error.status);
    throw error;
  }
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
