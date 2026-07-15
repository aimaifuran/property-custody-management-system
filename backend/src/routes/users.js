const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { authenticate, authorize } = require('../middlewares/auth');
const router = express.Router();

router.get('/', authenticate, authorize('canManageUsers'), async (req, res) => {
  const users = await User.find({ deleted: false }).select('-password').sort({ createdAt: -1 });
  return successResponse(res, 'Users retrieved', users);
});

router.post('/', authenticate, authorize('canManageUsers'), async (req, res) => {
  const exists = await User.findOne({ $or: [{ email: req.body.email }, { username: req.body.username }] });
  if (exists) return errorResponse(res, 'User already exists', [], 409);

  const hashed = await bcrypt.hash(req.body.password || 'Password123!', 10);
  const user = await User.create({ ...req.body, password: hashed });
  return successResponse(res, 'User created', { ...user.toObject(), password: undefined }, 201);
});

router.put('/:id', authenticate, authorize('canManageUsers'), async (req, res) => {
  if (req.body.password) req.body.password = await bcrypt.hash(req.body.password, 10);
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
  return successResponse(res, 'User updated', user);
});

router.delete('/:id', authenticate, authorize('canManageUsers'), async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { deleted: true });
  return successResponse(res, 'User deleted');
});

module.exports = router;