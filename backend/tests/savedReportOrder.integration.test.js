const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { recordSort, sortSavedReports } = require('../src/utils/savedReportOrder');
const User = require('../src/models/User');

const sources = [
  { url: 'iar', route: 'iar', model: 'InspectionAcceptanceReport', number: 'iarNumber', edit: { poNumber: 'Edited PO' } },
  { url: 'property-cards', route: 'propertyCards', model: 'PropertyCard', edit: { entityName: 'Edited entity' } },
  { url: 'ris', route: 'ris', model: 'RequisitionIssueSlip', number: 'risNumber', edit: { purpose: 'Edited purpose' } },
  { url: 'ics', route: 'ics', model: 'InventoryCustodianSlip', number: 'icsNumber', edit: { remarks: 'Edited remarks' } },
  { url: 'par', route: 'par', model: 'PropertyAcknowledgementReceipt', number: 'parNumber', edit: { remarks: 'Edited remarks' } },
  { url: 'ptr', route: 'transfers', model: 'PropertyTransferReport', number: 'ptrNumber', edit: { remarks: 'Edited remarks' } },
  { url: 'prs', route: 'returns', model: 'PropertyReturnSlip', number: 'prsNumber', edit: { note: 'Edited note' } },
  { url: 'returned-supply', route: 'returnedSupply', model: 'ReturnedSupply', base: { description: 'Chair', quantity: 1 }, edit: { note: 'Edited note' } },
  { url: 'ppe-station-reports', route: 'ppeStationReports', model: 'PpeStationReport', base: { accountGroup: 'Equipment', governmentUnit: 'Carigara', date: '2026-01-01', rows: [{ article: 'Chair', description: 'Office chair' }] }, edit: { accountGroup: 'Edited group', date: '2026-01-01' }, records: data => data.records },
  { url: 'monthly-item-reports', route: 'monthlyItemReports', model: 'PpeList', number: 'serialNumber', base: { automatic: false, month: '2026-01', lgu: 'Carigara', periodStart: '2026-01-01', periodEnd: '2026-01-31', reportDate: '2026-01-31', rows: [{ item: 'Office chair', quantity: 1 }] }, edit: { custodian: 'Edited custodian' }, records: data => data.records },
].map(source => ({ ...source, Model: require(`../src/models/${source.model}`) }));

test('editing saved reports persists their position at the end for every form', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  await Promise.all(sources.map(source => source.Model.init()));
  const app = express();
  app.use(express.json());
  for (const source of sources) app.use(`/${source.url}`, require(`../src/routes/${source.route}`));
  const server = app.listen(0);
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await database.stop(); });
  const makeAdmin = username => User.create({ username, firstName: 'Supply', lastName: 'Officer', email: `${username}@example.test`, password: 'test', role: 'admin', office: 'Supply', division: 'Supply' });
  const [firstAdmin, secondAdmin] = await Promise.all([makeAdmin('order-admin'), makeAdmin('order-other-admin')]);
  const request = async (url, method = 'GET', body, admin = firstAdmin) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/${url}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };

  for (const source of sources) await t.test(source.model, async () => {
    const rows = await source.Model.create([1, 2, 3].map(index => ({ ...source.base, ...(source.number ? { [source.number]: `${source.url}-${index}` } : {}), createdAt: new Date(`2026-01-0${index}T00:00:00Z`) })));
    const ids = rows.map(record => String(record._id));
    const getRows = async (admin = firstAdmin, suffix = '') => {
      const response = await request(`${source.url}${suffix}`, 'GET', undefined, admin);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return source.records ? source.records(response.body.data) : response.body.data;
    };
    const ownedIds = data => data.filter(record => ids.includes(String(record._id))).map(record => String(record._id));
    assert.deepEqual(ownedIds(await getRows()), [ids[2], ids[1], ids[0]], 'Untouched forms remain newest first');
    const before = Date.now();
    let response = await request(`${source.url}/${ids[1]}`, 'PUT', { ...source.edit, lastEditedAt: '2000-01-01' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(new Date(response.body.data.lastEditedAt).getTime() >= before, 'Manual edit timestamp is owned by the server');
    assert.deepEqual(ownedIds(await getRows(secondAdmin)), [ids[2], ids[0], ids[1]], 'Edited forms stay last after reloading in another account');
    response = await request(`${source.url}/${ids[2]}`, 'PUT', source.edit);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const loaded = await getRows();
    assert.deepEqual(ownedIds(loaded), [ids[0], ids[1], ids[2]], 'The next saved edit becomes the last form');
    assert.equal(String(loaded.at(-1)._id), ids[2], 'The edit is last in the complete list');
    if (!source.records) {
      const paged = await request(`${source.url}?page=1&limit=2`);
      assert.equal(paged.status, 200);
      assert.deepEqual(paged.body.data.items.map(record => String(record._id)), [ids[0], ids[1]], 'Server pagination uses the same ordering');
    }
    assert.deepEqual(sortSavedReports(loaded).map(record => String(record._id)), loaded.map(record => String(record._id)), 'Merged-list comparator matches database ordering');
    await source.Model.updateOne({ _id: ids[0] }, { $set: { updatedAt: new Date() } });
    assert.equal((await source.Model.findById(ids[0]).lean()).lastEditedAt, undefined);
    assert.deepEqual(ownedIds(await getRows()), [ids[0], ids[1], ids[2]], 'Automatic changes to updatedAt cannot move an untouched form');
  });

  await t.test('new forms remain first and rejected edits preserve their position', async () => {
    const created = await request('ics', 'POST', { icsNumber: 'ICS-NEWEST', lastEditedAt: '2000-01-01', items: [{ description: 'Chair', quantity: 1 }] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.lastEditedAt, undefined);
    const all = await request('ics');
    assert.equal(all.body.data[0]._id, created.body.data._id);
    await sources[3].Model.updateOne({ _id: created.body.data._id }, { $set: { user: firstAdmin._id } });
    const rejected = await request(`ics/${created.body.data._id}`, 'PUT', { remarks: 'Locked' });
    assert.equal(rejected.status, 409);
    assert.equal((await sources[3].Model.findById(created.body.data._id).lean()).lastEditedAt, undefined);
    assert.equal((await request('ics')).body.data[0]._id, created.body.data._id);
  });
});

test('non-form list queries retain their existing order', () => {
  assert.deepEqual(recordSort(User), { updatedAt: -1, createdAt: -1 });
});
