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
  const users = await User.find({ deleted: false }).select('-password -refreshToken -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry').populate('createdBy', 'firstName middleName lastName username').sort({ createdAt: -1 });
  return successResponse(res, 'Users retrieved', users);
});

router.post('/', authenticate, authorize('canManageUsers'), async (req, res) => {
  const exists = await User.findOne({ $or: [{ email: req.body.email }, { username: req.body.username }] });
  if (exists) return errorResponse(res, 'User already exists', [], 409);

  const hashed = await bcrypt.hash(req.body.password || 'Password123!', 10);
  const payload = { ...req.body, password: hashed, createdBy: req.user._id };
  if ((payload.role || 'user') === 'user') payload.permissions = [...new Set([...(payload.permissions || []), 'canViewRIS'])];
  const user = await User.create(payload);
  await linkLegacyRequests();
  return successResponse(res, 'User created', { ...user.toObject(), password: undefined }, 201);
});

router.put('/:id', authenticate, authorize('canManageUsers'), async (req, res) => {
  await linkLegacyRequests();
  if (req.body.password) req.body.password = await bcrypt.hash(req.body.password, 10);
  delete req.body.createdBy;
  const existing = await User.findById(req.params.id);
  if ((req.body.role || existing?.role) === 'user' && req.body.permissions) req.body.permissions = [...new Set([...req.body.permissions, 'canViewRIS'])];
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password -refreshToken -resetToken -resetTokenExpiry -emailChangeCode -emailChangeExpiry');
  return successResponse(res, 'User updated', user);
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