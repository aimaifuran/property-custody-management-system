const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const User = require('../src/models/User');
const IAR = require('../src/models/InspectionAcceptanceReport');
const RIS = require('../src/models/RequisitionIssueSlip');
const ICS = require('../src/models/InventoryCustodianSlip');
const PAR = require('../src/models/PropertyAcknowledgementReceipt');
const PTR = require('../src/models/PropertyTransferReport');
const PRS = require('../src/models/PropertyReturnSlip');

test('document numbers advance on save and remain unique for concurrent form submissions', { timeout: 90000 }, async t => {
  const database = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { systemBinary: path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe') },
  });
  await mongoose.connect(database.getUri());
  const Sequence = require('../src/models/DocumentSequence');
  await Promise.all([IAR, RIS, ICS, PAR, PTR, PRS, Sequence].map(Model => Model.init()));
  const { nextDocumentNumber, reserveDocumentNumber } = require('../src/utils/documentNumber');
  const server = require('../src/app').listen(0);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await database.stop();
  });

  await t.test('numeric IAR previews preserve reservations and include deleted numbers across calendar months', async () => {
    const date = new Date('2031-01-15T00:00:00Z');
    await IAR.create([
      { iarNumber: '2031-01-015' },
      { iarNumber: '2031-01-025', deleted: true },
      { iarNumber: '2031-01-500-draft' },
      { iarNumber: '2030-12-999' },
      { iarNumber: '015' },
      { iarNumber: '025', deleted: true },
    ]);
    assert.equal(await nextDocumentNumber(IAR, 'iarNumber', date), '026');
    assert.equal(await nextDocumentNumber(IAR, 'iarNumber', date), '026');
    assert.equal(await reserveDocumentNumber(IAR, 'iarNumber', date), '026');
    assert.equal(await nextDocumentNumber(IAR, 'iarNumber', new Date('2032-02-01T00:00:00Z')), '027');
    // A reservation is remembered even before a corresponding document is inserted.
    assert.equal(await reserveDocumentNumber(IAR, 'iarNumber', date), '027');
    await IAR.create({ iarNumber: '040' });
    assert.equal(await reserveDocumentNumber(IAR, 'iarNumber', date), '041');
    await IAR.deleteOne({ iarNumber: '040' });
    assert.equal(await nextDocumentNumber(IAR, 'iarNumber', date), '042');
  });

  await t.test('sequences are independent by document type and Manila calendar month', async () => {
    const beforeMidnight = new Date('2032-09-30T15:59:59Z');
    const afterMidnight = new Date('2032-09-30T16:00:00Z');
    assert.equal(await reserveDocumentNumber(ICS, 'icsNumber', beforeMidnight), '2032-09-001');
    assert.equal(await reserveDocumentNumber(ICS, 'icsNumber', afterMidnight), '2032-10-001');
    assert.equal(await reserveDocumentNumber(ICS, 'icsNumber', afterMidnight), '2032-10-002');
    assert.equal(await reserveDocumentNumber(PAR, 'parNumber', afterMidnight), '2032-10-001');
    assert.equal(await nextDocumentNumber(ICS, 'icsNumber', new Date('2032-10-31T16:00:00Z')), '2032-11-001');
    assert.equal(await reserveDocumentNumber(PTR, 'ptrNumber', new Date('2032-12-31T16:00:00Z')), '2033-01-001');
    await PRS.create({ prsNumber: '2032-10-999' });
    assert.equal(await reserveDocumentNumber(PRS, 'prsNumber', afterMidnight), '2032-10-1000');
  });

  await t.test('concurrent reservations from a new counter receive different contiguous suffixes', async () => {
    const date = new Date('2033-05-01T00:00:00Z');
    const numbers = await Promise.all(Array.from({ length: 18 }, () => reserveDocumentNumber(RIS, 'risNumber', date)));
    assert.equal(new Set(numbers).size, 18);
    assert.deepEqual(numbers.slice().sort(), Array.from({ length: 18 }, (_, index) => `2033-05-${String(index + 1).padStart(3, '0')}`));
    assert.equal(await nextDocumentNumber(RIS, 'risNumber', date), '2033-05-019');
  });

  await t.test('a failed transaction rolls back its number together with its document', async () => {
    const date = new Date('2034-07-01T00:00:00Z');
    await assert.rejects(mongoose.connection.transaction(async session => {
      const number = await reserveDocumentNumber(IAR, 'iarNumber', date, session);
      assert.equal(number, '042');
      await IAR.create([{ iarNumber: number }], { session });
      throw new Error('Receipt posting failed');
    }), /Receipt posting failed/);
    assert.equal(await IAR.countDocuments({ iarNumber: '042' }), 0);
    assert.equal(await nextDocumentNumber(IAR, 'iarNumber', date), '042');
    assert.equal(await reserveDocumentNumber(IAR, 'iarNumber', date), '042');
  });

  await t.test('concurrent first saves retry their whole transaction without duplicate numbers', async () => {
    const date = new Date('2035-04-01T00:00:00Z');
    const numbers = await Promise.all(Array.from({ length: 8 }, () => mongoose.connection.transaction(async session => {
      const ptrNumber = await reserveDocumentNumber(PTR, 'ptrNumber', date, session);
      await PTR.create([{ ptrNumber, reasonForTransfer: 'Concurrent numbered save' }], { session });
      return ptrNumber;
    })));
    assert.deepEqual(numbers.slice().sort(), Array.from({ length: 8 }, (_, index) => `2035-04-${String(index + 1).padStart(3, '0')}`));
    assert.equal(await PTR.countDocuments({ ptrNumber: /^2035-04-/ }), 8);
    assert.equal(await nextDocumentNumber(PTR, 'ptrNumber', date), '2035-04-009');
  });

  const admin = await User.create({ username: 'number-admin', firstName: 'Number', lastName: 'Admin', email: 'number-admin@example.test', password: 'test', role: 'admin', office: 'Supply', division: 'General Services' });
  const secondAdmin = await User.create({ username: 'number-admin-two', firstName: 'Second', lastName: 'Admin', email: 'number-admin-two@example.test', password: 'test', role: 'admin', office: 'Supply', division: 'General Services' });
  const requester = await User.create({ username: 'number-user', firstName: 'Number', lastName: 'User', email: 'number-user@example.test', password: 'test', role: 'user', permissions: ['canViewRIS'], office: 'Treasury', division: 'Finance' });
  const request = async (url, body, method = body === undefined ? 'GET' : 'POST', user = admin) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method,
      headers: { Authorization: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'dev-secret')}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const formTypes = [
    { type: 'IAR', route: '/iar', field: 'iarNumber', payload: index => ({ entityName: 'LGU', items: [{ stockNumber: `NUMBER-STOCK-${index}`, description: 'Numbered receipt supplies', quantity: 1, unit: 'piece', unitCost: 10, itemType: 'SUPPLY' }] }), edit: { invoiceNumber: 'CORRECTED-INVOICE' } },
    { type: 'ICS', route: '/ics', field: 'icsNumber', payload: () => ({ entityName: 'LGU', items: [{ description: 'Office chair', quantity: 1, unit: 'piece', unitCost: 1000, totalCost: 1000 }] }), edit: { remarks: 'Corrected note' } },
    { type: 'PAR', route: '/par', field: 'parNumber', payload: () => ({ entityName: 'LGU', items: [{ description: 'Laptop', quantity: 1, unit: 'unit', amount: 60000 }] }), edit: { remarks: 'Corrected note' } },
    { type: 'PTR', route: '/ptr', field: 'ptrNumber', payload: () => ({ entityName: 'LGU', reasonForTransfer: 'Office reassignment', items: [{ description: 'Transferred chair', amount: 1000, condition: 'Serviceable' }] }), edit: { remarks: 'Corrected note' } },
    { type: 'PRS', route: '/prs', field: 'prsNumber', payload: () => ({ lguName: 'LGU', purpose: 'Returned To Stock', items: [{ description: 'Returned spare chair', quantity: 1, unit: 'piece', unitValue: 1000 }] }), edit: { note: 'Corrected note' } },
    { type: 'RIS', route: '/ris', field: 'risNumber', payload: () => ({ entityName: 'LGU', fundCluster: 'General', division: 'Finance', office: 'Treasury', responsibilityCenterCode: '001', purpose: 'Office operations', requestedBy: { user: requester._id, name: 'Number User' }, receivedBy: { user: requester._id, name: 'Number User' }, items: [{ description: 'Office supplies', quantityRequested: 1, unit: 'piece' }] }), edit: { purpose: 'Corrected purpose' } },
  ];

  for (const form of formTypes) {
    await t.test(`${form.type} saves ignore stale automatic previews and editing retains the assigned number`, async () => {
      const preview = await request(`/document-numbers/${form.type}`);
      assert.equal(preview.status, 200, JSON.stringify(preview.body));
      const firstNumber = preview.body.data.nextNumber;
      assert.match(firstNumber, form.type === 'IAR' ? /^[0-9]{3,4}$/ : /^\d{4}-\d{2}-\d{3,}$/);
      assert.equal((await request(`/document-numbers/${form.type}`)).body.data.nextNumber, firstNumber);
      const prefix = form.type === 'IAR' ? '' : firstNumber.slice(0, 8);
      const start = Number(form.type === 'IAR' ? firstNumber : firstNumber.slice(8));
      const numbered = offset => `${prefix}${String(start + offset).padStart(3, '0')}`;
      const submissions = await Promise.all([0, 1].map(index => request(form.route, { ...form.payload(index), [form.field]: firstNumber, autoNumber: true }, 'POST', index ? secondAdmin : admin)));
      for (const result of submissions) assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.deepEqual(submissions.map(result => result.body.data[form.field]).sort(), [numbered(0), numbered(1)]);
      assert.equal((await request(`/document-numbers/${form.type}`)).body.data.nextNumber, numbered(2));

      const third = await request(form.route, { ...form.payload(2), [form.field]: '', autoNumber: true });
      assert.equal(third.status, 201, JSON.stringify(third.body));
      assert.equal(third.body.data[form.field], numbered(2));
      const updated = await request(`${form.route}/${third.body.data._id}`, { ...form.edit, autoNumber: true }, 'PUT');
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data[form.field], third.body.data[form.field]);
      assert.equal((await request(`/document-numbers/${form.type}`)).body.data.nextNumber, numbered(3));

      const legacyNumber = `LEGACY-${form.type}-NUMBER`;
      const legacy = await request(form.route, { ...form.payload(3), [form.field]: legacyNumber });
      assert.equal(legacy.status, form.type === 'IAR' ? 400 : 201, JSON.stringify(legacy.body));
      if (form.type !== 'IAR') assert.equal(legacy.body.data[form.field], legacyNumber);
      assert.equal((await request(`/document-numbers/${form.type}`)).body.data.nextNumber, numbered(3));
    });
  }

  await t.test('IAR-created RIS drafts have sequential numbers and an older blank draft is numbered once', async () => {
    const draft = await RIS.findOne({ iar: { $exists: true } });
    assert.match(draft.risNumber, /^\d{4}-\d{2}-\d{3,}$/);
    const legacyDraft = await RIS.create({ status: 'DRAFT' });
    const expected = (await request('/document-numbers/RIS')).body.data.nextNumber;
    const updated = await request(`/ris/${legacyDraft._id}`, { purpose: 'Complete older draft', autoNumber: true }, 'PUT');
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.risNumber, expected);
    const savedAgain = await request(`/ris/${legacyDraft._id}`, { purpose: 'Correct draft purpose', autoNumber: true }, 'PUT');
    assert.equal(savedAgain.status, 200, JSON.stringify(savedAgain.body));
    assert.equal(savedAgain.body.data.risNumber, expected);
  });

  await t.test('user RIS submissions use the same sequential numbers as the official RIS form', async () => {
    const userPreview = await request('/document-numbers/RIS', undefined, 'GET', requester);
    assert.equal(userPreview.status, 200, JSON.stringify(userPreview.body));
    const expected = userPreview.body.data.nextNumber;
    const first = await request('/ris/my-requests', { purpose: 'First numbered user request', items: [{ description: 'Paper', unit: 'ream', quantityRequested: 1 }] }, 'POST', requester);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.risNumber, expected);
    const next = (await request('/document-numbers/RIS')).body.data.nextNumber;
    const second = await request('/ris/my-requests', { purpose: 'Second numbered user request', items: [{ description: 'Pens', unit: 'piece', quantityRequested: 1 }] }, 'POST', requester);
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.data.risNumber, next);
    assert.notEqual(first.body.data.risNumber, second.body.data.risNumber);
  });

  const receipt = (number, index, autoNumber = false) => ({ iarNumber: number, autoNumber, items: [{ stockNumber: `IAR-DIGITS-${index}`, description: 'Paper', unit: 'ream', quantity: 1, itemType: 'SUPPLY', unitCost: 10 }] });
  await t.test('manual IAR numbers reject letters, punctuation and lengths outside 3 to 4 digits before recording stock', async () => {
    const before = await IAR.countDocuments();
    for (const [index, number] of ['12', '12345', 'IAR123', '12.3', '-123', '2026-10-001', '１２３'].entries()) {
      const response = await request('/iar', receipt(number, `invalid-${index}`));
      assert.equal(response.status, 400, JSON.stringify(response.body));
      assert.match(response.body.message, /3 to 4 digits only/);
    }
    assert.equal(await IAR.countDocuments(), before);
  });

  await t.test('unchanged historical IAR numbers remain editable and replacement numbers advance the counter', async () => {
    const legacy = await IAR.findOne({ iarNumber: '2031-01-015' });
    const unchanged = await request(`/iar/${legacy._id}`, { iarNumber: legacy.iarNumber, invoiceNumber: 'LEGACY-CORRECTED' }, 'PUT');
    assert.equal(unchanged.status, 200, JSON.stringify(unchanged.body));
    assert.equal(unchanged.body.data.iarNumber, legacy.iarNumber);
    const invalid = await request(`/iar/${legacy._id}`, { iarNumber: 'IAR-EDITED' }, 'PUT');
    assert.equal(invalid.status, 400);
    for (const operator of ['$set', '$unset']) {
      const bypass = await request(`/iar/${legacy._id}`, { [operator]: { iarNumber: 'IAR-EDITED' } }, 'PUT');
      assert.equal(bypass.status, 400, 'Update operators cannot bypass number validation');
      assert.equal((await IAR.findById(legacy._id)).iarNumber, legacy.iarNumber);
    }
    const changed = await request(`/iar/${legacy._id}`, { iarNumber: '0900' }, 'PUT');
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.data.iarNumber, '0900');
    assert.equal((await request('/document-numbers/IAR')).body.data.nextNumber, '901');
    const reduced = await request(`/iar/${legacy._id}`, { iarNumber: '0899' }, 'PUT');
    assert.equal(reduced.status, 200);
    assert.equal((await request('/document-numbers/IAR')).body.data.nextNumber, '901', 'Previously assigned numbers remain consumed after corrections');
  });

  await t.test('manual and automatic multi-admin IAR saves stay unique and a failed duplicate does not consume a number', async () => {
    const first = await request('/iar', receipt('0998', 'manual'));
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.iarNumber, '0998');
    assert.equal((await request('/document-numbers/IAR')).body.data.nextNumber, '999');
    const duplicate = await request('/iar', receipt('0998', 'duplicate'), 'POST', secondAdmin);
    assert.equal(duplicate.status, 409);
    assert.equal((await request('/document-numbers/IAR')).body.data.nextNumber, '999');
    const competing = await Promise.all([
      request('/iar', receipt('999', 'racing-manual'), 'POST', admin),
      request('/iar', receipt('999', 'racing-auto', true), 'POST', secondAdmin),
    ]);
    assert.equal(competing[1].status, 201, JSON.stringify(competing[1].body));
    assert.ok([201, 409].includes(competing[0].status), JSON.stringify(competing[0].body));
    const successful = competing.filter(result => result.status === 201).map(result => result.body.data.iarNumber);
    assert.equal(new Set(successful).size, successful.length);
    const next = await request('/iar', receipt('', 'four-digits', true));
    assert.equal(next.status, 201, JSON.stringify(next.body));
    assert.match(next.body.data.iarNumber, /^[0-9]{4}$/);
  });

  await t.test('IAR exhaustion never wraps or issues a five-digit number even with concurrent saves', async () => {
    const key = `${IAR.collection.name}:iarNumber:numeric`;
    await Sequence.updateOne({ _id: key }, { $set: { sequence: 9998 } });
    const responses = await Promise.all([admin, secondAdmin].map((user, index) => request('/iar', receipt('', `limit-${index}`, true), 'POST', user)));
    assert.deepEqual(responses.map(result => result.status).sort(), [201, 400]);
    assert.equal(responses.find(result => result.status === 201).body.data.iarNumber, '9999');
    assert.match(responses.find(result => result.status === 400).body.message, /9999/);
    assert.equal((await Sequence.findById(key)).sequence, 9999);
    const preview = await request('/document-numbers/IAR');
    assert.equal(preview.status, 400);
    assert.match(preview.body.message, /9999/);
    assert.equal(await IAR.countDocuments({ iarNumber: '10000' }), 0);
    assert.match((await request('/document-numbers/PTR')).body.data.nextNumber, /^\d{4}-\d{2}-\d{3,}$/, 'Other forms remain available with their existing numbering');
  });
});
