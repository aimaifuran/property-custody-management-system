const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const RIS = require('../src/models/RequisitionIssueSlip');
const PropertyReturnSlip = require('../src/models/PropertyReturnSlip');
const mailer = require('../src/utils/mailer');

test('merged deployment routes, list responses, login locks and password recovery remain compatible', { timeout: 60000 }, async t => {
  const database = await MongoMemoryServer.create({ binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') } });
  await mongoose.connect(database.getUri());
  const originalMailer = mailer.sendPasswordResetEmail;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://frontend.example.test';
  let resetUrl;
  let failDelivery = false;
  mailer.sendPasswordResetEmail = async (_user, url) => { if (failDelivery) throw new Error('SMTP unavailable'); resetUrl = url; };
  const app = require('../src/app');
  assert.equal(app.get('trust proxy'), 1);
  const server = app.listen(0);
  t.after(async () => {
    mailer.sendPasswordResetEmail = originalMailer;
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await database.stop();
  });
  const password = await bcrypt.hash('Valid123!', 4);
  const makeUser = (username, role = 'user', extra = {}) => User.create({ firstName: username, lastName: 'Test', username, email: `${username}@example.test`, password, office: 'Supply', division: 'Supply', role, permissions: ['canViewRIS'], ...extra });
  const admin = await makeUser('admin', 'admin');
  const owner = await makeUser('owner'); const other = await makeUser('other');
  const request = async (person, route, method = 'GET', body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (person) headers.Authorization = `Bearer ${jwt.sign({ id: person._id }, process.env.JWT_SECRET || 'dev-secret')}`;
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };

  for (const route of ['/api/reports/summary', '/api/dashboard/summary', '/api/dashboard', '/api/reports']) {
    const response = await request(admin, route);
    assert.equal(response.status, 200, route); assert.equal(response.body.message, 'Dashboard summary');
    assert.equal((await request(owner, route)).status, 403);
  }
  await RIS.create([
    { risNumber: 'OWN-1', purpose: 'Matching request', requestedBy: { user: owner._id } },
    { risNumber: 'OTHER-1', purpose: 'Matching request', requestedBy: { user: other._id } },
  ]);
  assert.equal(Array.isArray((await request(owner, '/api/ris')).body.data), true);
  const searched = await request(owner, '/api/ris?page=1&limit=1&search=Matching');
  assert.equal(searched.status, 200); assert.equal(searched.body.data.items.length, 1);
  assert.equal(searched.body.data.items[0].risNumber, 'OWN-1');
  assert.equal(searched.body.data.pagination.total, 1);
  assert.equal((await request(owner, '/api/ris?search=OTHER-1')).body.data.items.length, 0);
  await PropertyReturnSlip.create({ lguName: 'Carigara', returnedBy: { name: 'Owner' }, items: [] });
  for (const route of ['/api/iar', '/api/ics', '/api/par', '/api/property-cards', '/api/prs', '/api/returned-supply', '/api/ptr']) {
    assert.equal(Array.isArray((await request(admin, route)).body.data), true, route);
    const paged = await request(admin, `${route}?page=1&limit=1&search=Carigara`);
    assert.equal(paged.status, 200, route); assert.equal(Array.isArray(paged.body.data.items), true, route);
    assert.equal(paged.body.data.pagination.limit, 1);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'wrong' });
    assert.equal(response.status, attempt === 4 ? 423 : 401);
    if (attempt === 4) {
      const remaining = new Date(response.body.errors[0].lockUntil).getTime() - Date.now();
      assert.ok(remaining > 25000 && remaining <= 30000, 'fifth failure locks login for 30 seconds');
    }
  }
  assert.equal((await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'Valid123!' })).status, 423);
  await User.updateOne({ _id: owner._id }, { $set: { lockUntil: new Date(0), refreshToken: 'private-refresh', resetToken: 'private-reset', emailChangeCode: 'private-code' } });
  const login = await request(null, '/api/auth/login', 'POST', { identifier: 'owner', password: 'Valid123!' });
  assert.equal(login.status, 200);
  for (const field of ['password', 'refreshToken', 'resetToken', 'emailChangeCode']) assert.equal(login.body.data.user[field], undefined);
  const me = await request(owner, '/api/auth/me');
  for (const field of ['password', 'refreshToken', 'resetToken', 'emailChangeCode']) assert.equal(me.body.data.user[field], undefined);
  await User.updateOne({ _id: other._id }, { $set: { locked: true } });
  assert.equal((await request(null, '/api/auth/login', 'POST', { identifier: 'other', password: 'Valid123!' })).status, 423);
  assert.equal((await request(null, '/api/auth/forgot-password', 'POST', { identifier: 'owner' })).status, 200);
  assert.equal(resetUrl, undefined, 'No email before approval');
  assert.equal((await User.findById(owner._id)).resetToken, undefined);
  const requests = await request(admin, '/api/users/password-reset-requests');
  assert.equal(requests.body.data.length, 1);
  const resetId = requests.body.data[0]._id;
  assert.equal(requests.body.data[0].status, 'PENDING');
  assert.equal(requests.body.data[0].tokenHash, undefined);
  assert.equal((await request(owner, '/api/users/password-reset-requests')).status, 403);
  assert.equal((await request(owner, `/api/users/password-reset-requests/${resetId}/approve`, 'POST', {})).status, 403);
  await request(null, '/api/auth/forgot-password', 'POST', { identifier: 'owner' });
  assert.equal((await request(admin, '/api/users/password-reset-requests')).body.data.length, 1);
  failDelivery = true;
  assert.equal((await request(admin, `/api/users/password-reset-requests/${resetId}/approve`, 'POST', {})).status, 502);
  assert.equal((await User.findById(owner._id)).resetToken, undefined);
  assert.equal((await request(admin, '/api/users/password-reset-requests')).body.data[0].status, 'PENDING');
  failDelivery = false;
  assert.equal((await request(admin, `/api/users/password-reset-requests/${resetId}/approve`, 'POST', {})).status, 200);
  assert.equal((await request(admin, `/api/users/password-reset-requests/${resetId}/approve`, 'POST', {})).status, 409);
  for (const account of (await request(admin, '/api/users')).body.data) for (const field of ['password', 'refreshToken', 'resetToken', 'resetTokenExpiry', 'emailChangeCode']) assert.equal(account[field], undefined);
  assert.equal(new URL(resetUrl).origin, 'https://frontend.example.test');
  const rawToken = new URL(resetUrl).searchParams.get('token');
  const saved = await User.findById(owner._id);
  assert.equal(saved.resetToken, crypto.createHash('sha256').update(rawToken).digest('hex'));
  const concurrentResets = await Promise.all([1, 2].map(() => request(null, '/api/auth/reset-password', 'POST', { token: rawToken, password: 'NewValid123!' })));
  assert.deepEqual(concurrentResets.map(result => result.status).sort(), [200, 400], 'A reset link must be used only once even for concurrent requests');
  assert.equal((await request(null, '/api/auth/reset-password', 'POST', { token: rawToken, password: 'NewValid123!' })).status, 400);
  assert.equal(await bcrypt.compare('NewValid123!', (await User.findById(owner._id)).password), true);
  assert.equal((await request(admin, '/api/users/password-reset-requests')).body.data.length, 0);
  await request(null, '/api/auth/forgot-password', 'POST', { identifier: 'other' });
  const rejection = (await request(admin, '/api/users/password-reset-requests')).body.data[0];
  assert.equal((await request(admin, `/api/users/password-reset-requests/${rejection._id}/reject`, 'POST', { reason: 'Identity not confirmed' })).status, 200);
  assert.equal((await request(admin, `/api/users/password-reset-requests/${rejection._id}/approve`, 'POST', {})).status, 409);
  assert.equal((await User.findById(other._id)).resetToken, undefined);
  const manualForms = [
    ['/api/ics', { icsNumber: 'NEW-ICS', office: 'Mayor Office', receivedBy: { name: 'Mayor', date: '2026-03-01' }, items: [{ description: 'Aircon split type', quantity: 2, unit: 'unit', unitCost: 10000, totalCost: 20000 }] }],
    ['/api/par', { parNumber: 'NEW-PAR', office: 'Engineering', receivedBy: { name: 'Engineer', date: '2026-04-01' }, items: [{ description: 'Air conditioner', quantity: 1, unit: 'unit', amount: 50000 }] }],
    ['/api/property-cards', { propertyNumber: 'NEW-CARD', items: [{ description: 'Office table', receiptQuantity: 1, itdQuantity: 1, itdOfficeOfficer: 'Accounting', date: '2026-05-01' }] }],
    ['/api/returned-supply', { description: 'Returned chair', quantity: 1, unit: 'unit', unitValue: 100 }],
  ];
  for (const [route, body] of manualForms) {
    assert.equal((await request(owner, route, 'POST', body)).status, 403);
    const created = await request(admin, route, 'POST', { ...body, deleted: true });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.deleted, false);
    assert.equal((await request(admin, route, 'POST', { items: [] })).status, 400);
  }
  const issued = await RIS.create({ risNumber: 'OFFICE-2026', status: 'ISSUED', office: 'Treasury', issuedAt: '2026-01-01', receivedBy: { name: 'Treasurer' }, items: [{ description: 'Air conditioning unit', stockNumber: 'AC-1', quantityIssued: 3, unit: 'unit' }] });
  await PropertyReturnSlip.create({ status: 'RETURNED', returnedTo: { date: '2026-02-01' }, items: [{ ris: issued._id, risItem: issued.items[0]._id, description: 'Air conditioning unit', quantity: 1 }] });
  await RIS.create({ risNumber: 'FUTURE-2027', status: 'ISSUED', office: 'Supply', issuedAt: '2027-01-01', items: [{ description: 'Aircon', quantityIssued: 100 }] });
  await RIS.create({ risNumber: 'OLDER-2025', status: 'ISSUED', office: 'Treasury', issuedAt: '2025-01-01', items: [{ description: 'Aircon', quantityIssued: 1 }] });
  const annual = await request(admin, '/api/reports/annual-office-items?year=2026');
  assert.equal(annual.status, 200);
  assert.equal(annual.body.data.groups.find(group => group.itemType === 'Tables and Desks').rows[0].office, 'Accounting');
  const aircon = annual.body.data.groups.find(group => group.itemType === 'Air Conditioners');
  assert.equal(aircon.quantity, 6, 'Group aircon across offices; subtract confirmed returns');
  assert.deepEqual(aircon.offices, ['Engineering', 'Mayor Office', 'Treasury']);
  const recordedThisYear = await request(admin, '/api/reports/annual-office-items?year=2026&period=acquired');
  assert.equal(recordedThisYear.body.data.groups.find(group => group.itemType === 'Air Conditioners').quantity, 5);
  assert.equal((await request(owner, '/api/reports/annual-office-items?year=2026')).status, 403);
  assert.equal((await request(admin, '/api/reports/annual-office-items?year=bad')).status, 400);
  const reportMonth = require('../src/utils/monthlyItems').monthOf(new Date());
  const monthly = await request(admin, `/api/monthly-item-reports?month=${reportMonth}`);
  const newMonthly = await request(admin, '/api/monthly-item-reports', 'POST', { month: reportMonth, serialNumber: 'MANUAL-2026-01', lgu: 'Carigara', reportDate: '2026-01-31', rows: [{ item: 'FORGED', quantity: 999 }] });
  assert.equal(newMonthly.status, 201, JSON.stringify(newMonthly.body));
  assert.equal(newMonthly.body.data.automatic, false);
  assert.deepEqual(newMonthly.body.data.rows.map(row => row.item), monthly.body.data.report.rows.map(row => row.item));
  assert.equal(newMonthly.body.data.rows.some(row => row.item === 'FORGED'), false);

  // Admin-created users and typed requests retain a stable account link.
  const legacy = await RIS.create({ risNumber: 'LINK-LEGACY', requestedBy: { name: 'Jane Marie Doe' }, status: 'ISSUED', items: [{ description: 'Linked Laptop', quantityIssued: 2 }] });
  const added = await request(admin, '/api/users', 'POST', { firstName: 'Jane', middleName: 'Marie', lastName: 'Doe', username: 'jane', email: 'jane@example.test', password: 'Valid123!', office: 'Treasury', division: 'Finance', role: 'user', permissions: [] });
  assert.equal(added.status, 201);
  assert.equal(added.body.data.createdBy, String(admin._id));
  assert.ok(added.body.data.permissions.includes('canViewRIS'));
  const jane = await User.findById(added.body.data._id);
  assert.equal(String((await RIS.findById(legacy._id)).requestedBy.user), String(jane._id));
  assert.equal((await request(jane, '/api/ris/my-returns')).body.data.some(row => row.risNumber === 'LINK-LEGACY'), true);
  assert.equal((await request(owner, '/api/ris/my-returns')).body.data.some(row => row.risNumber === 'LINK-LEGACY'), false);
  const typedReturn = await request(admin, '/api/prs', 'POST', { returnedBy: { name: ' jane marie doe ' }, items: [{ description: 'Linked Laptop', mrNumber: 'LINK-LEGACY', quantity: 1 }] });
  assert.equal(typedReturn.status, 201, JSON.stringify(typedReturn.body));
  assert.equal(typedReturn.body.data.items[0].ris, String(legacy._id));
  assert.equal((await request(jane, '/api/ris/my-returns')).body.data.find(row => row.risNumber === 'LINK-LEGACY').status, 'Partially returned');
  const directReturn = await request(admin, '/api/returned-supply', 'POST', { returnedBy: { user: jane._id }, description: 'Linked Laptop', mrNumber: 'LINK-LEGACY', quantity: 1 });
  assert.equal(directReturn.status, 201, JSON.stringify(directReturn.body));
  assert.equal((await request(jane, '/api/ris/my-returns')).body.data.find(row => row.risNumber === 'LINK-LEGACY').status, 'Successfully returned');
  assert.equal((await request(admin, '/api/returned-supply', 'POST', { returnedBy: { user: jane._id }, description: 'Linked Laptop', mrNumber: 'LINK-LEGACY', quantity: 1 })).status, 400);
  assert.equal((await request(admin, '/api/prs', 'POST', { returnedBy: { user: owner._id }, items: [{ ris: legacy._id, risItem: legacy.items[0]._id, quantity: 1 }] })).status, 400);
  await request(admin, `/api/users/${jane._id}`, 'PUT', { firstName: 'Janet' });
  assert.equal((await request(jane, '/api/ris/my-returns')).body.data.find(row => row.risNumber === 'LINK-LEGACY').quantityReturned, 2);
  const sameName = await makeUser('same-name', 'user', { firstName: 'Janet', middleName: 'Marie', lastName: 'Doe' });
  const formPayload = { risNumber: 'LINK-NEW', entityName: 'Carigara', fundCluster: 'General', division: 'Finance', office: 'Treasury', responsibilityCenterCode: '001', requestedBy: { name: 'Janet Marie Doe' }, receivedBy: { name: 'Janet Marie Doe' } };
  assert.equal((await request(admin, '/api/ris', 'POST', formPayload)).status, 400, 'Duplicate names must require explicit selection');
  const selected = await request(admin, '/api/ris', 'POST', { ...formPayload, requestedBy: { user: jane._id }, receivedBy: { user: jane._id } });
  assert.equal(selected.status, 201);
  assert.equal(selected.body.data.requestedBy.name, 'Janet Marie Doe');
  assert.equal((await request(sameName, '/api/ris')).body.data.some(row => row.risNumber === 'LINK-NEW'), false);

  assert.equal((await request(owner, '/api/settings/entity-name', 'PATCH', { entityName: 'Unauthorized' })).status, 403);
  assert.equal((await request(admin, '/api/settings/entity-name', 'PATCH', { entityName: '   ' })).status, 400);
  assert.equal((await request(admin, '/api/settings/entity-name', 'PATCH', { entityName: 'Carigara Supply Office' })).status, 200);
  assert.equal((await request(owner, '/api/settings/entity-name')).body.data.entityName, 'Carigara Supply Office');
  for (const [index, stockNumber] of ['MANUAL-Ab12/2026', '', null].entries()) {
    const manual = await request(admin, '/api/ris', 'POST', { ...formPayload, risNumber: `MANUAL-STOCK-${index}`, requestedBy: { user: jane._id }, receivedBy: { user: jane._id }, items: [{ stockNumber, description: 'Manual item', unit: 'piece', quantityRequested: 1 }] });
    assert.equal(manual.status, 201, JSON.stringify(manual.body));
    assert.equal(manual.body.data.items[0].stockNumber, stockNumber);
    assert.equal(manual.body.data.entityName, 'Carigara Supply Office');
    assert.equal(manual.body.data.fundCluster, formPayload.fundCluster);
    assert.equal(manual.body.data.responsibilityCenterCode, formPayload.responsibilityCenterCode);
    const edited = await request(admin, `/api/ris/${manual.body.data._id}`, 'PUT', { items: [{ stock_number: 'EDITED-A9', description: 'Manual item', unit: 'piece', quantityRequested: 1 }] });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.items[0].stockNumber, 'EDITED-A9');
    const cleared = await request(admin, `/api/ris/${manual.body.data._id}`, 'PUT', { items: [{ stockNumber: '', description: 'Manual item', unit: 'piece', quantityRequested: 1 }] });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.items[0].stockNumber, '');
  }

});
