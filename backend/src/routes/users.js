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

router.get('/:id/records', authenticate, adminOnly, async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.isValidObjectId(req.params.id)) return errorResponse(res, 'Invalid user account', [], 400);
  const user = await User.findOne({ _id: req.params.id, deleted: false, role: 'user' });
  if (!user) return errorResponse(res, 'User account not found', [], 404);
  const { accountRecords } = require('../utils/accountRecords');
  const Accountability = require('../models/PropertyAccountability');
  const PropertyReturnSlip = require('../models/PropertyReturnSlip');
  const [risRows, assets, returnSlips] = await Promise.all([
    accountRecords(user, true),
    Accountability.find({ deleted: false, active: true, user: user._id }).populate({ path: 'inventory', populate: { path: 'item' } }).sort({ createdAt: -1 }).lean(),
    PropertyReturnSlip.find({ deleted: false, $or: [{ submittedBy: user._id }, { 'returnedBy.user': user._id }] }).sort({ createdAt: -1 }).lean(),
  ]);
  return successResponse(res, 'User records retrieved', { risRows, assets, returnSlips });
});

// Record a physical, serviceable return directly from the admin's account records.
router.post('/:id/records/returned', authenticate, adminOnly, require('../utils/recordAccountReturn')());

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
  const users = await User.find({ deleted: false, ...(req.query.role === 'user' ? { role: 'user' } : {}) }).select('-password -refreshToken -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry').populate('createdBy', 'firstName middleName lastName username').sort({ createdAt: -1 });
  return successResponse(res, 'Users retrieved', users);
});

router.post('/', authenticate, validateAdminForm('users'), authorize('canManageUsers'), async (req, res) => {
  if (req.body.role !== undefined && !['admin', 'user'].includes(req.body.role)) return errorResponse(res, 'Select Admin or User as the account type', [], 400);
  const exists = await User.findOne({ $or: [{ email: req.body.email }, { username: req.body.username }] });
  if (exists) return errorResponse(res, 'User already exists', [], 409);

  const hashed = await bcrypt.hash(req.body.password || 'Password123!', 10);
  const payload = { ...req.body, password: hashed, createdBy: req.user._id };
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
    for (const key of ['refreshToken', 'resetToken', 'resetTokenExpiry', 'lockUntil']) unset[key] = 1;
  }
  if (changedEmail) for (const key of ['pendingEmail', 'emailChangeCode', 'emailChangeExpiry', 'resetToken', 'resetTokenExpiry']) unset[key] = 1;
  // Account recovery edits retain the existing role and never accept session fields from the client.
  updates.permissions = existing.role === 'admin' ? [] : ['canViewRIS'];
  try {
    const user = await User.findByIdAndUpdate(existing._id, { $set: updates, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { returnDocument: 'after', runValidators: true }).select('-password -refreshToken -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry');
    await ActivityLog.create({ user: req.user._id, action: 'Account updated', details: `${existing.username}: account details updated${changedEmail ? '; email changed' : ''}${req.body.password ? '; password reset' : ''}` });
    return successResponse(res, 'Account updated', user);
  } catch (error) { return errorResponse(res, error.code === 11000 ? 'Email or username is already in use' : 'Check the account details and try again', [], error.code === 11000 ? 409 : 400); }
});

router.patch('/:id/lock', authenticate, authorize('canManageUsers'), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { locked: Boolean(req.body.locked) }, { new: true }).select('-password -refreshToken -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry');
  return successResponse(res, user.locked ? 'User locked' : 'User unlocked', user);
});

router.delete('/:id', authenticate, authorize('canManageUsers'), async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { deleted: true });
  return successResponse(res, 'User deleted');
});

module.exports = router;
