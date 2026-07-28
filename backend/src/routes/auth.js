const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { loginLimiter, forgotPasswordLimiter } = require('../middlewares/rateLimiter');
const { sendPasswordResetEmail, sendEmailChangeCode } = require('../utils/mailer');
const { authenticate } = require('../middlewares/auth');
const router = express.Router();

const hashSecret = (token) => crypto.createHash('sha256').update(token).digest('hex');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

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
    if (!user) return errorResponse(res, 'Invalid Credentials', [], 401);

    if (user.lockUntil && user.lockUntil > new Date()) {
      return errorResponse(res, 'Too many login attempts', [{ lockUntil: user.lockUntil }], 423);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
        await user.save();

        await ActivityLog.create({
          user: user._id,
          action: 'Account locked',
          details: 'Too many failed login attempts',
          ipAddress: req.ip,
          browser: req.get('user-agent'),
        });

        return errorResponse(res, 'Too many login attempts', [{ lockUntil: user.lockUntil }], 423);
      }

      await user.save();
      return errorResponse(res, 'Invalid Credentials', [], 401);
    }

    if (user.status !== 'active') return errorResponse(res, 'Account inactive', [], 403);

    const accessToken = createToken(user);
    const refreshToken = createRefreshToken(user);
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
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
      user.resetToken = hashSecret(rawToken);
      user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
        console.warn('FRONTEND_URL is not set in production — password reset emails will link to localhost.');
      }
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
    resetToken: hashSecret(token),
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

router.put('/profile', authenticate, [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  // Only self-service profile fields are editable here — role/permissions/status
  // stay admin-only via the /users/:id route.
  const editableFields = ['firstName', 'middleName', 'lastName', 'office', 'division'];
  const updates = {};
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-password');
  return successResponse(res, 'Profile updated', { user });
});

router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return errorResponse(res, 'Current password is incorrect', [], 400);

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  await ActivityLog.create({
    user: user._id,
    action: 'Password changed',
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'Password updated successfully');
});

router.post('/request-email-change', authenticate, [
  body('newEmail').isEmail().withMessage('A valid email is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const newEmail = req.body.newEmail.toLowerCase().trim();

  const existing = await User.findOne({ email: newEmail, deleted: false });
  if (existing) return errorResponse(res, 'That email is already in use by another account', [], 409);

  const code = crypto.randomInt(100000, 1000000).toString();
  const user = await User.findById(req.user._id);
  user.pendingEmail = newEmail;
  user.emailChangeCode = hashSecret(code);
  user.emailChangeExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendEmailChangeCode(user, newEmail, code);

  await ActivityLog.create({
    user: user._id,
    action: 'Email change requested',
    details: `Verification code sent to ${newEmail}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'A verification code has been sent to your new email address.');
});

router.post('/confirm-email-change', authenticate, [
  body('code').notEmpty().withMessage('Verification code is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  const user = await User.findById(req.user._id);
  if (!user.pendingEmail || !user.emailChangeCode || !user.emailChangeExpiry) {
    return errorResponse(res, 'No pending email change request found. Please start again.', [], 400);
  }
  if (user.emailChangeExpiry < new Date()) {
    return errorResponse(res, 'This verification code has expired. Please request a new one.', [], 400);
  }
  if (hashSecret(req.body.code) !== user.emailChangeCode) {
    return errorResponse(res, 'Invalid verification code', [], 400);
  }

  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeCode = undefined;
  user.emailChangeExpiry = undefined;
  await user.save();

  await ActivityLog.create({
    user: user._id,
    action: 'Email changed',
    details: `Email updated to ${user.email}`,
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  const safeUser = user.toObject();
  delete safeUser.password;
  return successResponse(res, 'Email updated successfully', { user: safeUser });
});

module.exports = router;
