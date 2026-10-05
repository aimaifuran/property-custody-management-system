const test = require('node:test');
const assert = require('node:assert/strict');
const PpeList = require('../src/models/PpeList');
const { referenceReport } = require('../src/utils/ppeReference');
const fields = { serialNumber: '2026-008-0008', lgu: 'CARIGARA, LEYTE', periodStart: '2026-08-01', periodEnd: '2026-08-31', reportDate: '2026-09-05' };
test('PPE reports validate item rows and preserve blank accounting costs', async () => {
  const record = new PpeList({ ...fields, rows: [{ item: 'Biometric device', quantity: 1 }] });
  await record.validate();
  assert.equal(record.rows[0].unitCost, null);
});
test('reports reject empty lists, missing descriptions, and negative quantities or costs', async () => {
  for (const rows of [[], [{ item: '', quantity: 1 }], [{ item: 'Device', quantity: -1 }], [{ item: 'Device', quantity: 1, unitCost: -1 }]]) {
    await assert.rejects(new PpeList({ ...fields, rows }).validate(), { name: 'ValidationError' });
  }
});
test('the supplied report and recapitulation persist without filling blank costs', async () => {
  const record = new PpeList(referenceReport);
  await record.validate();
  assert.equal(record.rows.length, 100);
  assert.equal(record.recapitulation.length, 38);
  assert.equal(record.recapitulation[0].unitCost, null);
  assert.equal(record.recapitulation[0].totalCost, null);
  assert.equal(record.custodian, 'RALPH M. SAVERET JR.');
});
