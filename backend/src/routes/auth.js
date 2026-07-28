const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { loginLimiter, forgotPasswordLimiter } = require('../middlewares/rateLimiter');
const { sendPasswordResetEmail } = require('../utils/mailer');
const router = express.Router();

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createToken = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '1h' });
const createRefreshToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET || 'refresh-secret', { expiresIn: '7d' });
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
});

const getTokenFromRequest = (req) => req.cookies?.token || req.headers.authorization?.split(' ')[1];

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
      ...cookieOptions(),
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions(),
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000,
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
  const token = getTokenFromRequest(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
      await ActivityLog.create({ user: decoded.id, action: 'Logout', ipAddress: req.ip, browser: req.get('user-agent') });
    } catch (error) {
      // ignore
    }
  }
  res.clearCookie('token', cookieOptions());
  res.clearCookie('refreshToken', cookieOptions());
  return successResponse(res, 'Logout successful');
});

router.get('/me', async (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) return errorResponse(res, 'Authentication required', [], 401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(decoded.id).select('-password');
    return successResponse(res, 'User fetched', { user });
  } catch (error) {
    return errorResponse(res, 'Invalid token', [], 401);
  }
});

// Works identically for admin and user accounts alike - reset eligibility is
// based only on the account existing and being active, not on role.
router.post('/forgot-password', forgotPasswordLimiter, [
  body('identifier').notEmpty().withMessage('Email or username is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  // Always return the same generic message so the endpoint can't be used to
  // enumerate which emails/usernames have accounts.
  const genericMessage = 'If an account with that email or username exists, a password reset link has been sent.';

  try {
    const { identifier } = req.body;
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
      deleted: false,
    });

    if (user && user.status === 'active') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetToken = hashResetToken(rawToken);
      user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail(user, resetUrl);

      await ActivityLog.create({
        user: user._id,
        action: 'Password reset requested',
        ipAddress: req.ip,
        browser: req.get('user-agent'),
      });
    }

    return successResponse(res, genericMessage);
  } catch (error) {
    console.error('Forgot password error:', error);
    return successResponse(res, genericMessage);
  }
});

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const { token, password } = req.body;
  const user = await User.findOne({
    resetToken: hashResetToken(token),
    resetTokenExpiry: { $gt: new Date() },
    deleted: false,
  });

  if (!user) return errorResponse(res, 'This reset link is invalid or has expired', [], 400);

  user.password = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  // Invalidate any existing session so the reset also signs the account out everywhere.
  user.refreshToken = undefined;
  await user.save();

  await ActivityLog.create({
    user: user._id,
    action: 'Password reset completed',
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'Password updated. You can now sign in with your new password.');
});

module.exports = router;
