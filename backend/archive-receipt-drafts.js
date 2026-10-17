require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const RIS = require('./src/models/RequisitionIssueSlip');

// Only untouched system-generated receipt drafts qualify. Real requests,
// reviewed/edited drafts and issued documents are never archived here.
const filter = { deleted: false, status: 'DRAFT', iar: { $ne: null }, issuedAt: null,
  office: { $in: [null, ''] }, division: { $in: [null, ''] }, purpose: { $in: [null, ''] },
  'requestedBy.user': null, 'requestedBy.offlineRecipient': null, 'requestedBy.name': { $in: [null, ''] },
  $expr: { $eq: ['$createdAt', '$updatedAt'] }, 'items.quantityIssued': { $not: { $gt: 0 } } };

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must identify the existing database.');
  await connectDatabase();
  const count = await RIS.countDocuments(filter);
  if (!process.argv.includes('--apply')) return console.log(JSON.stringify({ dryRun: true, untouchedReceiptDrafts: count }));
  const archive = mongoose.connection.collection('sample_record_archives');
  await archive.createIndex({ batchId: 1, collection: 1, originalId: 1 });
  const batchId = new mongoose.Types.ObjectId();
  const deletedAt = new Date();
  await mongoose.connection.transaction(async session => {
    const records = await RIS.find(filter).session(session).lean();
    if (!records.length) return;
    await archive.insertMany(records.map(record => ({ batchId, deletedAt, reason: 'Retired automatic IAR receipt drafts', collection: RIS.collection.name, originalId: record._id, record })), { session });
    await RIS.collection.updateMany({ _id: { $in: records.map(record => record._id) } }, { $set: { deleted: true, deletedAt, deletionBatch: batchId } }, { session });
  });
  console.log(JSON.stringify({ archived: count, batchId: String(batchId) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(disconnectDatabase);
