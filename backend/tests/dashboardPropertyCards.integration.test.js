const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Item = require('../src/models/Item');
const Card = require('../src/models/PropertyCard');
const User = require('../src/models/User');

test('dashboard Property Cards count matches issued items in the stock ledger', { timeout: 60000 }, async t => {
  const database = await MongoMemoryServer.create({ binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });
  const admin = await User.create({ username: 'dashboard-admin', firstName: 'Admin', lastName: 'Test', email: 'dashboard@example.test', password: 'test', role: 'admin', office: 'Supply', division: 'Supply' });
  const stocks = await Item.create(['Issued', 'Received', 'Deleted card', 'Deleted item'].map((description, index) => ({ stockNumber: String(index), description, unit: 'UNIT', deleted: index === 3 })));
  await Card.create([
    { stockItem: stocks[0]._id, items: [{ itdQuantity: 1 }, { itdQuantity: 2 }] },
    { stockItem: stocks[1]._id, items: [{ receiptQuantity: 5, itdQuantity: 0 }] },
    { stockItem: stocks[2]._id, deleted: true, items: [{ itdQuantity: 1 }] },
    { stockItem: stocks[3]._id, items: [{ itdQuantity: 1 }] },
    { items: [{ itdQuantity: 1 }] },
  ]);
  const get = async route => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}` } });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  };
  const summary = await get('/reports/summary');
  const list = await get('/property-cards/stock-ledger');
  assert.equal(summary.counts.propertyCards, 1);
  assert.equal(summary.counts.propertyCards, list.pagination.total);
  await Card.updateOne({ stockItem: stocks[1]._id }, { $push: { items: { itdQuantity: 1 } } });
  assert.equal((await get('/reports/summary')).counts.propertyCards, 2);
  assert.equal((await get('/property-cards/stock-ledger')).pagination.total, 2);
});
