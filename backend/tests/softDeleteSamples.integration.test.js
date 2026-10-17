const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { softDeleteSamples } = require('../src/utils/softDeleteSamples');

test('sample reset archives originals and hides linked stock without deleting accounts or settings', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  t.after(async () => { await mongoose.disconnect(); await database.stop(); });
  await softDeleteSamples(); // Load the affected models before inserting fixtures.
  const Item = mongoose.model('Item');
  const Report = mongoose.model('PpeStationReport');
  const item = { stockNumber: 'TEST', name: 'Paper', quantityOnHand: 10, deleted: false };
  await Item.collection.insertOne(item);
  await Report.collection.insertOne({ accountGroup: 'Test', deleted: false });
  await mongoose.connection.collection('users').insertOne({ username: 'keep' });
  await mongoose.connection.collection('settings').insertOne({ entityName: 'Keep' });
  assert.equal((await softDeleteSamples()).counts.Item, 1);
  assert.equal(await Item.countDocuments({ deleted: false }), 1);
  const result = await softDeleteSamples({ apply: true });
  assert.equal(await Item.countDocuments({ deleted: false }), 0);
  assert.equal(await Item.countDocuments({ deleted: true }), 1);
  assert.equal(await Report.findOne({}), null);
  const snapshot = await mongoose.connection.collection('sample_record_archives').findOne({ batchId: new mongoose.Types.ObjectId(result.batchId), collection: Item.collection.name });
  assert.equal(snapshot.record.quantityOnHand, 10);
  assert.equal(snapshot.record.deleted, false);
  assert.equal(await mongoose.connection.collection('users').countDocuments({}), 1);
  assert.equal(await mongoose.connection.collection('settings').countDocuments({}), 1);
  assert.equal((await softDeleteSamples({ apply: true })).counts.Item, 0);
});
