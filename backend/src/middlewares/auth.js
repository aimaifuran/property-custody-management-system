const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/response');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    if (!token) return errorResponse(res, 'Authentication required', [], 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.status !== 'active') return errorResponse(res, 'Invalid user session', [], 401);

    req.user = user;
    next();
  } catch (error) {
    return errorResponse(res, 'Invalid token', [], 401);
  }
};

const authorize = (permission) => (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  if (requiredPermissions.some((value) => req.user.permissions?.includes(value))) return next();
  return errorResponse(res, 'Forbidden', [], 403);
};

module.exports = { authenticate, authorize };
