const Notification = require('../models/Notification');
const User = require('../models/User');

async function notifyUsers(users, title, body, link, session) {
  const rows = [...new Set(users.filter(Boolean).map(String))].map(user => ({ user, title, body, link }));
  if (rows.length) await Notification.create(rows, session ? { session, ordered: true } : {});
}

async function notifyAdmins(title, body, link, session) {
  const users = await User.find({ role: 'admin', status: 'active', deleted: false }).select('_id').session(session || null);
  await notifyUsers(users.map(user => user._id), title, body, link, session);
}

module.exports = { notifyUsers, notifyAdmins };
