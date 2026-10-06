const mongoose = require('mongoose');
const User = require('../models/User');
const RIS = require('../models/RequisitionIssueSlip');

const accountName = user => [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim() || user.username;
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const aliases = user => [accountName(user), [user.firstName, user.lastName].filter(Boolean).join(' '), user.username, user.email].map(normalize).filter(Boolean);

async function resolveAccount(person, accounts) {
  if (!person) return person;
  const value = typeof person === 'string' ? { name: person } : { ...person };
  let matches;
  if (value.user) {
    const id = value.user._id || value.user;
    if (!mongoose.isValidObjectId(id)) throw new Error('Select a valid user account');
    matches = await User.find({ _id: id, deleted: false, role: 'user' });
    if (!matches.length) throw new Error('The selected user account is unavailable');
  } else {
    const name = normalize(value.name);
    if (!name) return value;
    matches = (accounts || await User.find({ deleted: false, role: 'user' }).select('firstName middleName lastName username email office')).filter(user => aliases(user).includes(name));
    if (matches.length > 1) throw new Error('More than one account has this name. Select the user account explicitly.');
  }
  if (!matches.length) { delete value.user; return value; }
  const user = matches[0];
  return { ...value, user: user._id, name: accountName(user), designation: value.designation || user.office };
}

// Backfill only names that identify exactly one account; existing IDs survive renames.
async function linkLegacyRequests() {
  const records = await RIS.find({ deleted: false, $or: [{ 'requestedBy.user': null }, { 'receivedBy.user': null }] });
  if (!records.length) return;
  const accounts = await User.find({ deleted: false, role: 'user' }).select('firstName middleName lastName username email office');
  for (const record of records) {
    const updates = {};
    for (const section of ['requestedBy', 'receivedBy']) {
      if (!record[section]?.user && record[section]?.name) {
        try {
          const linked = await resolveAccount(record[section].toObject ? record[section].toObject() : record[section], accounts);
          if (linked.user) updates[`${section}.user`] = linked.user;
        } catch { /* Ambiguous legacy names require an admin to choose an account. */ }
      }
    }
    for (const [field, value] of Object.entries(updates)) await RIS.updateOne({ _id: record._id, [field]: null }, { $set: { [field]: value } });
  }
}

const ownerFilter = userId => ({ $or: [
  { 'requestedBy.user': userId },
  { 'requestedBy.user': null, 'receivedBy.user': userId },
] });

module.exports = { accountName, resolveAccount, linkLegacyRequests, ownerFilter };
