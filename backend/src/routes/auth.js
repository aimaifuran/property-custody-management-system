const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { loginLimiter } = require('../middlewares/rateLimiter');
const router = express.Router();

const createToken = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1h' });
const createRefreshToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh-secret', { expiresIn: '7d' });

router.post('/login', loginLimiter, [
  body('identifier').notEmpty().withMessage('Username or email is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

    const { identifier, password, rememberMe } = req.body;
    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    if (!user) return errorResponse(res, 'Invalid credentials', [], 401);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return errorResponse(res, 'Invalid credentials', [], 401);

    if (user.status !== 'active') return errorResponse(res, 'Account inactive', [], 403);

    const accessToken = createToken(user);
    const refreshToken = createRefreshToken(user);
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
      sameSite: 'lax',
    });

    await ActivityLog.create({ user: user._id, action: 'Login', ipAddress: req.ip, browser: req.get('user-agent') });

    const safeUser = user.toObject();
    delete safeUser.password;
    delete safeUser.refreshToken;
    delete safeUser.resetToken;

    return successResponse(res, 'Login successful', { user: safeUser, accessToken });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Unable to sign in. Please try again.', [], 500);
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      await ActivityLog.create({ user: decoded.id, action: 'Logout', ipAddress: req.ip, browser: req.get('user-agent') });
    } catch (error) {
      // ignore
    }
  }
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return successResponse(res, 'Logout successful');
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return errorResponse(res, 'Authentication required', [], 401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(decoded.id).select('-password');
    return successResponse(res, 'User fetched', { user });
  } catch (error) {
    return errorResponse(res, 'Invalid token', [], 401);
  }
});

module.exports = router;