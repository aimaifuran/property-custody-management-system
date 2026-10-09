const { validateAdminForm } = require('../middlewares/validateAdminForm');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const { createResetLink } = require('../utils/passwordRecovery');
const ActivityLog = require('../models/ActivityLog');
const { successResponse, errorResponse } = require('../utils/response');
const { loginLimiter, forgotPasswordLimiter } = require('../middlewares/rateLimiter');
const { sendPasswordResetEmail, sendEmailChangeCode } = require('../utils/mailer');
const { authenticate, adminOnly } = require('../middlewares/auth');
const { getAccessToken, isSessionUserActive } = require('../utils/session');
const router = express.Router();
const { pictureUpload, pictureData } = require('../utils/pictureUpload');

router.post('/profile-picture', authenticate, adminOnly, (req, res, next) => {
  pictureUpload(req, res, error => {
    if (error) return errorResponse(res, error.code === 'LIMIT_FILE_SIZE' ? 'Profile picture must be 2 MB or smaller.' : 'Upload one profile picture.', [], 400);
    next();
  });
}, async (req, res) => {
  const image = pictureData(req.file);
  if (!image) return errorResponse(res, 'Choose a valid JPG, PNG, or WebP image.', [], 400);
  await User.updateOne({ _id: req.user._id }, { $set: { profilePicture: image } });
  return successResponse(res, 'Profile picture updated');
});

const publicUser = (user) => {
  const data = user.toObject();
  for (const field of ['password', 'refreshToken', 'resetToken', 'resetTokenExpiry', 'emailChangeCode', 'emailChangeExpiry']) delete data[field];
  return data;
};

const hashSecret = (token) => crypto.createHash('sha256').update(token).digest('hex');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000;

const createToken = (user, expiresIn = 3600) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev-secret', { expiresIn });
const createRefreshToken = (user) => jwt.sign({ id: user._id, jti: crypto.randomUUID() }, process.env.JWT_REFRESH_SECRET || 'refresh-secret', { expiresIn: '7d' });
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
});

router.post('/login', loginLimiter, [
  body('identifier').notEmpty().withMessage('Username or email is required'),
  body('password').isString().notEmpty().withMessage('Password is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

    const { identifier, password, rememberMe } = req.body;
    const user = await User.findOne({ deleted: false, $or: [{ email: identifier }, { username: identifier }] });
    if (!user) return errorResponse(res, 'Invalid credentials', [], 401);
    if (user.locked) return errorResponse(res, 'This user account is temporarily locked', [], 423);

    if (user.lockUntil && user.lockUntil > new Date()) {
      res.set('Retry-After', String(Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000)));
      return errorResponse(res, 'Too many attempts, please try again shortly', [{ lockUntil: user.lockUntil }], 423);
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

        res.set('Retry-After', String(Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000)));
      return errorResponse(res, 'Too many attempts, please try again shortly', [{ lockUntil: user.lockUntil }], 423);
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
      maxAge: 60 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions(),
      // Keep a non-remembered session alive while its browser is open. The
      // signed refresh token still expires after seven days in either case.
      ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
    });

    await ActivityLog.create({ user: user._id, action: 'Login', ipAddress: req.ip, browser: req.get('user-agent') });

    const safeUser = publicUser(user);
    delete safeUser.password;
    delete safeUser.refreshToken;
    delete safeUser.resetToken;

    return successResponse(res, 'Login successful', { user: safeUser, accessToken });
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Unable to sign in. Please try again.', [], 500);
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return errorResponse(res, 'Your session has expired. Please sign in again.', [], 401);
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret', { algorithms: ['HS256'] });
    const user = await User.findOne({ _id: decoded.id, refreshToken });
    if (!isSessionUserActive(user)) return errorResponse(res, 'Your session has expired. Please sign in again.', [], 401);
    const remainingSeconds = Math.floor(decoded.exp - Date.now() / 1000);
    if (!Number.isFinite(remainingSeconds) || remainingSeconds < 1) return errorResponse(res, 'Your session has expired. Please sign in again.', [], 401);
    const expiresIn = Math.min(3600, remainingSeconds);
    const accessToken = createToken(user, expiresIn);
    res.cookie('token', accessToken, { ...cookieOptions(), maxAge: expiresIn * 1000 });
    // Reuse the verified refresh token without extending its original deadline.
    return successResponse(res, 'Session refreshed', { user: publicUser(user), accessToken });
  } catch (error) {
    return errorResponse(res, 'Your session has expired. Please sign in again.', [], 401);
  }
});

router.post('/logout', async (req, res) => {
  const token = getAccessToken(req);
  let user;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret', { algorithms: ['HS256'] });
      user = await User.findByIdAndUpdate(decoded.id, { refreshToken: null });
    } catch (error) {
      // An expired access token can still be logged out through its verified,
      // stored refresh session. An expired access token never authorizes work.
    }
  }
  if (!user && req.cookies?.refreshToken) {
    try {
      const refreshToken = req.cookies.refreshToken;
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret', { algorithms: ['HS256'] });
      user = await User.findOneAndUpdate({ _id: decoded.id, refreshToken }, { refreshToken: null });
    } catch (error) {
      // Logout also clears local cookies when no valid session remains.
    }
  }
  if (user) await ActivityLog.create({ user: user._id, action: 'Logout', ipAddress: req.ip, browser: req.get('user-agent') });
  res.clearCookie('token', cookieOptions());
  res.clearCookie('refreshToken', cookieOptions());
  return successResponse(res, 'Logout successful');
});

router.get('/me', authenticate, async (req, res) => {
  return successResponse(res, 'User fetched', { user: publicUser(req.user) });
});

// User recovery requires administrator approval. Admin accounts retain email recovery.
router.post('/forgot-password', forgotPasswordLimiter, [
  body('identifier').notEmpty().withMessage('Email or username is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return errorResponse(res, 'Validation failed', errors.array(), 400);

  // Always return the same generic message so the endpoint can't be used to
  // enumerate which emails/usernames have accounts.
  const genericMessage = 'If an active user account exists, your request has been sent to the administrator for approval. Approved requests receive a reset link by email.';

  try {
    const { identifier } = req.body;
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
      deleted: false,
    });

    if (user && user.status === 'active') {
      if (user.role === 'user') {
        await PasswordResetRequest.updateMany({ user: user._id, status: 'APPROVED', expiresAt: { $lte: new Date() } }, { $set: { status: 'EXPIRED' }, $unset: { activeKey: 1 } });
        const request = await PasswordResetRequest.findOneAndUpdate(
          { activeKey: String(user._id) },
          { $setOnInsert: { user: user._id, status: 'PENDING' } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        if (request.status === 'PENDING') {
          await User.updateOne({ _id: user._id }, { $unset: { resetToken: 1, resetTokenExpiry: 1 } });
        }
      } else {
        const link = createResetLink();
        user.resetToken = link.tokenHash;
        user.resetTokenExpiry = link.expiresAt;
        await user.save();
        await sendPasswordResetEmail(user, link.url);
      }

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

  if (!user || user.status !== 'active') return errorResponse(res, 'This reset link is invalid or has expired', [], 400);
  const approval = user.role === 'user' ? await PasswordResetRequest.findOne({ user: user._id, status: 'APPROVED', tokenHash: hashSecret(token), expiresAt: { $gt: new Date() } }) : null;
  if (user.role === 'user' && !approval) return errorResponse(res, 'An administrator must approve this password reset', [], 403);

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await User.findOneAndUpdate(
    { _id: user._id, resetToken: hashSecret(token), resetTokenExpiry: { $gt: new Date() } },
    { $set: { password: passwordHash, failedLoginAttempts: 0 }, $unset: { resetToken: 1, resetTokenExpiry: 1, refreshToken: 1, lockUntil: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) return errorResponse(res, 'This reset link is invalid or has already been used', [], 400);
  if (approval) await PasswordResetRequest.updateOne({ _id: approval._id }, { $set: { status: 'COMPLETED' }, $unset: { activeKey: 1, tokenHash: 1 } });

  await ActivityLog.create({
    user: user._id,
    action: 'Password reset completed',
    ipAddress: req.ip,
    browser: req.get('user-agent'),
  });

  return successResponse(res, 'Password updated. You can now sign in with your new password.');
});

router.put('/profile', authenticate, validateAdminForm('profile'), [
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
  return successResponse(res, 'Profile updated', { user: publicUser(user) });
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

  const safeUser = publicUser(user);
  delete safeUser.password;
  return successResponse(res, 'Email updated successfully', { user: safeUser });
});

module.exports = router;
