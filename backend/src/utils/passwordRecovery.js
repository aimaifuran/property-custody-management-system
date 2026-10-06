const crypto = require('crypto');

const hashSecret = token => crypto.createHash('sha256').update(token).digest('hex');
const createResetLink = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://pais-v1.vercel.app' : 'http://localhost:5173');
  return { tokenHash: hashSecret(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000), url: `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}` };
};
module.exports = { hashSecret, createResetLink };
