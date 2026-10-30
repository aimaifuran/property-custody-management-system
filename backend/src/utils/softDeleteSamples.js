const mongoose = require('mongoose');

const modelNames = [
  'InspectionAcceptanceReport', 'PropertyCard', 'RequisitionIssueSlip',
  'InventoryCustodianSlip', 'PropertyAcknowledgementReceipt', 'PropertyTransferReport',
  'PropertyReturnSlip', 'ReturnedSupply', 'Inventory', 'Property',
  'PropertyAccountability', 'LedgerTransaction', 'Item', 'PpeList', 'PpeStationReport',
];

// Never purge records or reset identity counters. The snapshot preserves every
// original field (including balances) for a future whole-batch restoration.
async function softDeleteSamples({ apply = false, clearActivity = false } = {}) {
  const models = modelNames.map(name => require(`../models/${name}`));
  const cleanupModels = clearActivity ? ['Notification', 'ActivityLog', 'WorkflowEmail'].map(name => require(`../models/${name}`)) : [];
  const counts = {};
  for (const model of models) counts[model.modelName] = await model.collection.countDocuments({ deleted: { $ne: true } });
  for (const model of cleanupModels) counts[model.modelName] = await model.collection.countDocuments({});
  if (!apply) return { dryRun: true, counts };
  const batchId = new mongoose.Types.ObjectId();
  const deletedAt = new Date();
  const archive = mongoose.connection.collection('sample_record_archives');
  // Explicitly create before the transaction for older MongoDB deployments.
  await archive.createIndex({ batchId: 1, collection: 1, originalId: 1 });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const model of models) {
        const records = await model.collection.find({ deleted: { $ne: true } }, { session }).toArray();
        counts[model.modelName] = records.length;
        if (!records.length) continue;
        await archive.insertMany(records.map(record => ({ batchId, deletedAt, collection: model.collection.name, originalId: record._id, record })), { session });
        await model.collection.updateMany({ _id: { $in: records.map(record => record._id) } }, { $set: { deleted: true, deletedAt, deletionBatch: batchId } }, { session });
      }
      for (const model of cleanupModels) {
        const records = await model.collection.find({}, { session }).toArray();
        counts[model.modelName] = records.length;
        if (!records.length) continue;
        await archive.insertMany(records.map(record => ({ batchId, deletedAt, collection: model.collection.name, originalId: record._id, record })), { session });
        await model.collection.deleteMany({ _id: { $in: records.map(record => record._id) } }, { session });
      }
    });
    return { dryRun: false, batchId: String(batchId), counts };
  } finally {
    await session.endSession();
  }
}

module.exports = { softDeleteSamples, modelNames };
