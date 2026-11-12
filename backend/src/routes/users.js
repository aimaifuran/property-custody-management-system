const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const ActivityLog = require('../models/ActivityLog');
const { createResetLink } = require('../utils/passwordRecovery');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize, adminOnly } = require('../middlewares/auth');
const router = express.Router();
const { linkLegacyRequests } = require('../utils/accountLinks');
const { lockInactiveUsers } = require('../utils/inactivityLock');
router.post('/:id/profile-picture', authenticate, (req, res) => {
  return errorResponse(res, 'Profile photos can only be changed from your own account profile.', [], 403);
});

router.get('/record-activity', authenticate, adminOnly, async (req, res) => {
  return successResponse(res, 'Account activity', await require('../utils/accountActivity')());
});

router.get('/:id/records', authenticate, adminOnly, async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid user account', [], 400);
  const user = await User.findOne({ _id: req.params.id, deleted: false, role: 'user' });
  if (!user) return errorResponse(res, 'User account not found', [], 404);
  await linkLegacyRequests();
  const { accountRecords } = require('../utils/accountRecords');
  const Accountability = require('../models/PropertyAccountability');
  const PropertyReturnSlip = require('../models/PropertyReturnSlip');
  const PropertyTransferReport = require('../models/PropertyTransferReport');
  const [risRows, assets, returnSlips] = await Promise.all([
    accountRecords(user, true),
    Accountability.find({ deleted: false, active: true, user: user._id }).populate('ris', 'risNumber').populate({ path: 'inventory', populate: [{ path: 'item' }, { path: 'inspectionAcceptanceReport', select: 'poNumber' }] }).sort({ createdAt: -1 }).lean(),
    PropertyReturnSlip.find({ deleted: false, $or: [{ submittedBy: user._id }, { 'returnedBy.user': user._id }] }).sort({ createdAt: -1 }).lean(),
  ]);
  const ptrRecords = await PropertyTransferReport.find({
    deleted: false,
    $or: [
      { fromUser: user._id },
      { toUser: user._id },
      ...(returnSlips.length ? [{ 'items.returnSlip': { $in: returnSlips.map(slip => slip._id) } }] : []),
    ],
  }).populate({ path: 'items.inventory', populate: { path: 'item', select: 'name description stockNumber' } })
    .sort({ date: -1, createdAt: -1 }).lean();
  const returnSlipById = new Map(returnSlips.map(slip => [String(slip._id), slip]));
  const transferRecords = ptrRecords.map(report => {
    const linkedSlip = report.items.map(item => returnSlipById.get(String(item.returnSlip || ''))).find(Boolean);
    const sourceUser = report.fromUser || linkedSlip?.returnedBy?.user;
    return {
      ...report,
      direction: String(sourceUser || '') === String(user._id) ? 'OUTGOING' : 'INCOMING',
      fromAccountableOfficer: report.fromAccountableOfficer || linkedSlip?.returnedBy?.name || '',
    };
  });
  const currentAssets = assets.map(asset => ({
    ...asset,
    quantityRemaining: Math.max(0, Number(asset.quantity || 0) - Number(asset.returnedQuantity || 0)),
  }));
  return successResponse(res, 'User records retrieved', { risRows, assets: currentAssets, returnSlips, transferRecords });
});

// Record a physical, serviceable return directly from the admin's account records.
router.post('/:id/records/returned', authenticate, adminOnly, require('../utils/recordAccountReturn')());

router.patch('/:id/records/:risId/:itemId', authenticate, adminOnly, async (req, res) => {
  const mongoose = require('mongoose');
  const RequisitionIssueSlip = require('../models/RequisitionIssueSlip');
  const Accountability = require('../models/PropertyAccountability');
  const Inventory = require('../models/Inventory');
  const InspectionAcceptanceReport = require('../models/InspectionAcceptanceReport');
  const InventoryCustodianSlip = require('../models/InventoryCustodianSlip');
  const PropertyAcknowledgementReceipt = require('../models/PropertyAcknowledgementReceipt');
  const Property = require('../models/Property');
  const PropertyCard = require('../models/PropertyCard');
  const PropertyTransferReport = require('../models/PropertyTransferReport');
  const PropertyReturnSlip = require('../models/PropertyReturnSlip');
  const ReturnedSupply = require('../models/ReturnedSupply');
  const PpeList = require('../models/PpeList');
  const Item = require('../models/Item');
  const { propertyNumber, description, accountability } = req.body || {};
  if (![req.params.id, req.params.risId, req.params.itemId].every(mongoose.isValidObjectId)) return errorResponse(res, 'Invalid property record', [], 400);
  if (typeof propertyNumber !== 'string' || typeof description !== 'string' || !description.trim()) return errorResponse(res, 'Enter a Property No. and description', [], 400);
  const user = await User.findOne({ _id: req.params.id, deleted: false, role: 'user' });
  if (!user) return errorResponse(res, 'User account not found', [], 404);
  const asset = accountability ? await Accountability.findOne({ _id: accountability, user: user._id, deleted: false }).lean() : null;
  const risId = asset?.ris || req.params.risId;
  const itemId = asset?.risItem || req.params.itemId;
  const risQuery = { _id: risId, deleted: false, status: { $in: ['ISSUED', 'ACCOUNTABILITY_LOCKED'] } };
  if (!asset) risQuery.$or = [{ 'receivedBy.user': user._id }, { 'requestedBy.user': user._id }];
  const ris = await RequisitionIssueSlip.findOne(risQuery);
  const item = ris?.items.id(itemId);
  if (!ris || !item) return errorResponse(res, 'Issued property record not found for this account', [], 404);
  if (Number(item.quantityIssued || 0) <= 0) return errorResponse(res, 'This record has no issued quantity to update', [], 400);
  const ownedAsset = asset ? await Accountability.findById(asset._id) : await Accountability.findOne({ ris: ris._id, risItem: item._id, user: user._id, deleted: false });
  const inventoryId = ownedAsset?.inventory || item.inventory;
  const inventory = inventoryId ? await Inventory.findById(inventoryId) : null;
  const nextPropertyNumber = propertyNumber.trim();
  const nextDescription = description.trim();

  let linkedIars = [];
  if (inventory) linkedIars = await InspectionAcceptanceReport.find({ deleted: false, $or: [{ 'items.inventory': inventory._id }, { 'items.inventories': inventory._id }] });
  if (!linkedIars.length && ris.iar) {
    const linkedIar = await InspectionAcceptanceReport.findOne({ _id: ris.iar, deleted: false });
    if (linkedIar) linkedIars = [linkedIar];
  }
  if (!linkedIars.length) return errorResponse(res, 'The source IAR for this property record could not be found', [], 404);

  // The edited Property No. is the PPE list's assigned number. Keep it on the
  // accountability only; Inventory.propertyNumber feeds the IAR Inventory Item No.
  if (ownedAsset && ownedAsset.propertyNumber !== nextPropertyNumber) {
    ownedAsset.propertyNumber = nextPropertyNumber;
    await ownedAsset.save();
  }

  item.description = nextDescription;
  ris.lastEditedAt = new Date();
  await ris.save();

  if (inventory?.item) await Item.updateOne({ _id: inventory.item }, { $set: { description: nextDescription } });
  if (inventory?.property) {
    const linkedProperty = await Property.findById(inventory.property);
    if (linkedProperty) {
      linkedProperty.description = nextDescription;
      await linkedProperty.save();
    }
  }

  for (const iar of linkedIars) {
    const linkedReceiptRows = [];
    for (const [receiptItemIndex, receiptItem] of iar.items.entries()) {
      const matches = inventory && (
        String(receiptItem.inventory || '') === String(inventory._id)
        || (receiptItem.inventories || []).some(id => String(id) === String(inventory._id))
        || (!receiptItem.inventory && !(receiptItem.inventories || []).length && [receiptItem.stockNumber, receiptItem.stockPropertyNumber].some(number => String(number || '') === String(item.stockNumber || '')))
      );
      if (!matches) continue;
      receiptItem.description = nextDescription;
      receiptItem.item = nextDescription;
      linkedReceiptRows.push(receiptItemIndex);
    }
    iar.lastEditedAt = new Date();
    await iar.save();

    const ppeReports = linkedReceiptRows.length ? await PpeList.find({ 'rows.source': 'IAR', 'rows.sourceId': String(iar._id) }) : [];
    for (const ppeReport of ppeReports) {
      let changed = false;
      for (const receiptItemIndex of linkedReceiptRows) {
        const row = ppeReport.rows.find(candidate => candidate.source === 'IAR' && candidate.sourceId === String(iar._id) && Number(candidate.sourceRow) === receiptItemIndex);
        if (row) {
          row.item = nextDescription;
          row.accountingManual = true;
          changed = true;
        }
      }
      if (changed) {
        ppeReport.recapitulation = require('../utils/monthlyItems').recapitulate(ppeReport.rows);
        ppeReport.lastEditedAt = new Date();
        await ppeReport.save();
      }
    }
  }

  if (inventory) {
    for (const Model of [InventoryCustodianSlip, PropertyAcknowledgementReceipt]) {
      const forms = await Model.find({ deleted: false, 'items.inventory': inventory._id });
      for (const form of forms) {
        for (const formItem of form.items) if (String(formItem.inventory || '') === String(inventory._id)) {
          formItem.description = nextDescription;
        }
        form.lastEditedAt = new Date();
        await form.save();
      }
    }
    const cards = await PropertyCard.find({ deleted: false, $or: [{ inventory: inventory._id }, { 'items.inventory': inventory._id }] });
    for (const card of cards) {
      if (String(card.inventory || '') === String(inventory._id)) {
        card.description = nextDescription;
      }
      for (const cardItem of card.items || []) if (String(cardItem.inventory || '') === String(inventory._id)) {
        cardItem.description = nextDescription;
      }
      card.lastEditedAt = new Date();
      await card.save();
    }
    const transfers = await PropertyTransferReport.find({ deleted: false, 'items.inventory': inventory._id });
    for (const report of transfers) {
      for (const line of report.items) if (String(line.inventory || '') === String(inventory._id)) {
        line.description = nextDescription;
      }
      report.lastEditedAt = new Date();
      await report.save();
    }
  }

  if (ownedAsset) {
    const linkedReturns = await PropertyReturnSlip.find({ deleted: false, 'items.accountability': ownedAsset._id });
    for (const slip of linkedReturns) {
      for (const line of slip.items) if (String(line.accountability || '') === String(ownedAsset._id)) {
        line.description = nextDescription;
      }
      await slip.save();
    }
  }
  await ReturnedSupply.updateMany({ ris: ris._id, risItem: item._id }, { $set: { description: nextDescription } });
  return successResponse(res, 'Property record updated', { risId: ris._id, itemId: item._id });
});
router.get('/password-reset-requests', authenticate, adminOnly, async (req, res) => {
  await PasswordResetRequest.updateMany({ status: 'APPROVED', expiresAt: { $lte: new Date() } }, { $set: { status: 'EXPIRED' }, $unset: { activeKey: 1, tokenHash: 1 } });
  const requests = await PasswordResetRequest.find({ status: { $in: ['PENDING', 'SENDING', 'APPROVED'] } })
    .populate('user', 'firstName lastName username email office deleted status').sort({ createdAt: -1 }).lean();
  return successResponse(res, 'Password recovery requests', requests.filter(record => record.user && !record.user.deleted && record.user.status === 'active'));
});

router.post('/password-reset-requests/:id/approve', authenticate, adminOnly, async (req, res) => {
  const request = await PasswordResetRequest.findOneAndUpdate({ _id: req.params.id, status: 'PENDING' }, { $set: { status: 'SENDING' } }, { new: true });
  if (!request) return errorResponse(res, 'This request is no longer awaiting approval', [], 409);
  const user = await User.findOne({ _id: request.user, deleted: false, status: 'active', role: 'user' });
  if (!user) {
    await PasswordResetRequest.updateOne({ _id: request._id }, { $set: { status: 'REJECTED', reason: 'Account unavailable' }, $unset: { activeKey: 1 } });
    return errorResponse(res, 'This account is no longer available', [], 404);
  }
  const link = createResetLink();
  try {
    await User.updateOne({ _id: user._id }, { $set: { resetToken: link.tokenHash, resetTokenExpiry: link.expiresAt } });
    await sendPasswordResetEmail(user, link.url);
    await PasswordResetRequest.updateOne({ _id: request._id, status: 'SENDING' }, { $set: { status: 'APPROVED', reviewedBy: req.user._id, reviewedAt: new Date(), tokenHash: link.tokenHash, expiresAt: link.expiresAt } });
    await ActivityLog.create({ user: req.user._id, action: 'Password reset approved', details: `Reset email sent to ${user.username}`, ipAddress: req.ip });
    return successResponse(res, 'Approved. A password reset link was emailed to the user.');
  } catch (error) {
    await User.updateOne({ _id: user._id, resetToken: link.tokenHash }, { $unset: { resetToken: 1, resetTokenExpiry: 1 } });
    await PasswordResetRequest.updateOne({ _id: request._id }, { $set: { status: 'PENDING' } });
    return errorResponse(res, 'Unable to send the reset email. The request is still pending; check email delivery and try again.', [], 502);
  }
});

router.post('/password-reset-requests/:id/reject', authenticate, adminOnly, async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 500);
  const request = await PasswordResetRequest.findOneAndUpdate({ _id: req.params.id, status: 'PENDING' }, { $set: { status: 'REJECTED', reviewedBy: req.user._id, reviewedAt: new Date(), reason }, $unset: { activeKey: 1 } }, { new: true });
  if (!request) return errorResponse(res, 'This request is no longer awaiting approval', [], 409);
  await ActivityLog.create({ user: req.user._id, action: 'Password reset rejected', details: `Request ${request._id}`, ipAddress: req.ip });
  return successResponse(res, 'Password recovery request rejected');
});

router.get('/', authenticate, authorize('canManageUsers'), async (req, res) => {
  await lockInactiveUsers();
  const users = await User.find({ deleted: false, ...(req.query.role === 'user' ? { role: 'user' } : {}) }).select('-password -refreshToken -refreshTokens -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry').populate('createdBy', 'firstName middleName lastName username').sort({ createdAt: -1 });
  return successResponse(res, 'Users retrieved', users);
});

router.post('/', authenticate, validateAdminForm('users'), authorize('canManageUsers'), async (req, res) => {
  if (req.body.role !== undefined && !['admin', 'user'].includes(req.body.role)) return errorResponse(res, 'Select Admin or User as the account type', [], 400);
  const exists = await User.findOne({ $or: [{ email: req.body.email }, { username: req.body.username }] });
  if (exists) return errorResponse(res, 'User already exists', [], 409);

  const hashed = await bcrypt.hash(req.body.password || 'Password123!', 10);
  const payload = { ...req.body, password: hashed, createdBy: req.user._id };
  delete payload.profilePicture;
  payload.permissions = payload.role === 'admin' ? [] : ['canViewRIS'];
  const user = await User.create(payload);
  await linkLegacyRequests();
  return successResponse(res, 'User created', { ...user.toObject(), password: undefined }, 201);
});

router.put('/:id', authenticate, validateAdminForm('users'), authorize('canManageUsers'), async (req, res) => {
  const existing = await User.findOne({ _id: req.params.id, deleted: false });
  if (!existing) return errorResponse(res, 'Account not found', [], 404);
  const updates = Object.fromEntries(['firstName', 'middleName', 'lastName', 'email', 'username', 'office', 'division', 'position'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
  if (req.body.email !== undefined && (typeof req.body.email !== 'string' || !require('validator').isEmail(req.body.email.trim()))) return errorResponse(res, 'Enter a valid email address', [], 400);
  const changedEmail = req.body.email && req.body.email.trim().toLowerCase() !== existing.email;
  if (req.body.password && (typeof req.body.password !== 'string' || req.body.password.length < 8 || Buffer.byteLength(req.body.password) > 72)) return errorResponse(res, 'Password must be at least 8 characters and at most 72 bytes', [], 400);
  const unset = {};
  if (req.body.password) {
    updates.password = await bcrypt.hash(req.body.password, 10);
    updates.failedLoginAttempts = 0;
    for (const key of ['refreshToken', 'refreshTokens', 'resetToken', 'resetTokenExpiry', 'lockUntil', 'passwordResetCode', 'passwordResetCodeExpiry', 'passwordResetCodeAttempts']) unset[key] = 1;
  }
  if (changedEmail) for (const key of ['pendingEmail', 'emailChangeCode', 'emailChangeExpiry', 'resetToken', 'resetTokenExpiry', 'passwordResetCode', 'passwordResetCodeExpiry', 'passwordResetCodeAttempts']) unset[key] = 1;
  // Account recovery edits retain the existing role and never accept session fields from the client.
  updates.permissions = existing.role === 'admin' ? [] : ['canViewRIS'];
  try {
    const user = await User.findByIdAndUpdate(existing._id, { $set: updates, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken -refreshTokens -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry');
    await ActivityLog.create({ user: req.user._id, action: 'Account updated', details: `${existing.username}: account details updated${changedEmail ? '; email changed' : ''}${req.body.password ? '; password reset' : ''}` });
    return successResponse(res, 'Account updated', user);
  } catch (error) { return errorResponse(res, error.code === 11000 ? 'Email or username is already in use' : 'Check the account details and try again', [], error.code === 11000 ? 409 : 400); }
});

router.patch('/:id/lock', authenticate, authorize('canManageUsers'), async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid user account', [], 400);
  const locked = Boolean(req.body.locked);
  const user = await User.findOneAndUpdate({ _id: req.params.id, deleted: false, ...(locked ? {} : { status: 'active' }) }, { $set: { locked, ...(!locked ? { inactivityResetAt: new Date() } : {}) }, ...(locked ? { $unset: { refreshToken: 1, refreshTokens: 1 } } : {}) }, { returnDocument: 'after' }).select('-password -refreshToken -refreshTokens -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry');
  if (!user) {
    const existing = await User.exists({ _id: req.params.id, deleted: false });
    return errorResponse(res, existing ? 'Inactive accounts are automatically locked. Activate the account before unlocking it.' : 'Account not found', [], existing ? 409 : 404);
  }
  return successResponse(res, user.locked ? 'User locked' : 'User unlocked', user);
});

router.delete('/:id', authenticate, authorize('canManageUsers'), async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { deleted: true });
  return successResponse(res, 'User deleted');
});

module.exports = router;
