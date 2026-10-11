const User = require('../models/User');

const INACTIVITY_DAYS = 60;

// Never-used accounts count from creation; an administrator unlock starts a new grace period.
const lockInactiveUsers = async (scope = {}, now = new Date()) => {
  const cutoff = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  return User.updateMany({
    $and: [
      scope,
      { role: 'user', deleted: false, locked: false },
      { $or: [{ lastLogin: { $lte: cutoff } }, { lastLogin: null, createdAt: { $lte: cutoff } }] },
      { $or: [{ inactivityResetAt: null }, { inactivityResetAt: { $lte: cutoff } }] },
    ],
  }, { $set: { locked: true }, $unset: { refreshToken: 1 } });
};

module.exports = { INACTIVITY_DAYS, lockInactiveUsers };
