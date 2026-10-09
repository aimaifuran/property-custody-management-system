const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const RegistrationRequest = require('../models/RegistrationRequest');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { successResponse, errorResponse } = require('../utils/response');
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.post('/', limiter, async (req, res) => {
  const details = {};
  const body = req.body || {};
  for (const field of ['firstName', 'middleName', 'lastName', 'email', 'username', 'office', 'division', 'position']) {
    const value = body[field];
    if (value != null && typeof value !== 'string') return errorResponse(res, 'Enter valid registration details.', [], 400);
    details[field] = (value || '').trim();
    if (field !== 'middleName' && !details[field]) return errorResponse(res, `${field} is required.`, [], 400);
    if (details[field].length > (['firstName', 'middleName', 'lastName'].includes(field) ? 100 : 150)) return errorResponse(res, `${field} is too long.`, [], 400);
  }
  details.email = details.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) || !/^[A-Za-z0-9._-]{3,50}$/.test(details.username)) return errorResponse(res, 'Enter a valid email and a username of 3–50 letters, numbers, dots, underscores or hyphens.', [], 400);
  if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password) > 72 || body.password !== body.confirmPassword) return errorResponse(res, 'Passwords must match and contain at least 8 characters (maximum 72 bytes).', [], 400);
  const identity = { $or: [{ email: details.email }, { username: details.username }] };
  if (await User.exists(identity) || await RegistrationRequest.exists({ ...identity, status: 'PENDING' })) return errorResponse(res, 'An account or pending request already uses this email or username.', [], 409);
  try {
    await RegistrationRequest.create({ ...details, passwordHash: await bcrypt.hash(body.password, 10) });
    return successResponse(res, 'Registration request sent. An administrator must approve it before you can sign in.', null, 201);
  } catch (error) {
    if (error.code === 11000) return errorResponse(res, 'A pending request already uses this email or username.', [], 409);
    throw error;
  }
});

router.get('/', authenticate, adminOnly, async (req, res) => {
  const requests = await RegistrationRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 }).lean();
  return successResponse(res, 'Registration requests retrieved', requests);
});

router.post('/:id/:action', authenticate, adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['approve', 'reject'].includes(req.params.action)) return errorResponse(res, 'Invalid registration review.', [], 400);
  if (req.params.action === 'reject') {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    const request = await RegistrationRequest.findOneAndUpdate({ _id: req.params.id, status: 'PENDING' }, { $set: { status: 'REJECTED', reviewedBy: req.user._id, reviewedAt: new Date(), reason } }, { new: true });
    if (!request) return errorResponse(res, 'This request is no longer pending.', [], 409);
    return successResponse(res, 'Registration request rejected');
  }
  try {
    await mongoose.connection.transaction(async session => {
      const request = await RegistrationRequest.findOne({ _id: req.params.id, status: 'PENDING' }).select('+passwordHash').session(session);
      if (!request) { const error = new Error('This request is no longer pending.'); error.status = 409; throw error; }
      if (await User.exists({ $or: [{ email: request.email }, { username: request.username }] }).session(session)) { const error = new Error('An account already uses this email or username.'); error.status = 409; throw error; }
      const [account] = await User.create([{ firstName: request.firstName, middleName: request.middleName, lastName: request.lastName, email: request.email, username: request.username, password: request.passwordHash, office: request.office, division: request.division, position: request.position, role: 'user', status: 'active', permissions: ['canViewRIS', 'canCreateRIS'], createdBy: req.user._id }], { session });
      request.status = 'APPROVED'; request.reviewedBy = req.user._id; request.reviewedAt = new Date(); request.account = account._id;
      await request.save({ session });
    });
    return successResponse(res, 'Registration approved. The user can now sign in.');
  } catch (error) {
    if (error.status || error.code === 11000) return errorResponse(res, error.status ? error.message : 'An account already uses this email or username.', [], 409);
    throw error;
  }
});
module.exports = router;
