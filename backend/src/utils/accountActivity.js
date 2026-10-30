const RIS = require('../models/RequisitionIssueSlip');
const PRS = require('../models/PropertyReturnSlip');
const PTR = require('../models/PropertyTransferReport');
const Accountability = require('../models/PropertyAccountability');

module.exports = async function accountActivity() {
  const sources = [
    [RIS, ['$requestedBy.user', '$receivedBy.user']],
    [PRS, ['$submittedBy', '$returnedBy.user']],
    [PTR, ['$fromUser', '$toUser']],
    [Accountability, ['$user']],
  ];
  const results = await Promise.all(sources.map(([Model, accounts]) => Model.aggregate([
    { $match: { deleted: false } },
    { $project: { accounts, date: { $ifNull: ['$updatedAt', '$createdAt'] } } },
    { $unwind: '$accounts' },
    { $match: { accounts: { $ne: null } } },
    { $group: { _id: '$accounts', latest: { $max: '$date' } } },
  ])));
  const activity = {};
  for (const row of results.flat()) {
    const key = String(row._id);
    const date = new Date(row.latest).getTime();
    if (date > (activity[key] || 0)) activity[key] = date;
  }
  const users = await require('../models/User').find({ deleted: false, role: 'user' }).select('_id').lean();
  return Object.fromEntries(users.filter(user => activity[String(user._id)]).map(user => [String(user._id), activity[String(user._id)]]));
};
