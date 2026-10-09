const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAdminForm, getAdminFormErrors } = require('../src/middlewares/validateAdminForm');

const person = { name: 'Admin Officer', designation: 'Custodian', position: 'Custodian', date: '2026-10-09' };
const completeIcs = () => ({
  entityName: 'Municipality', fundCluster: 'General Fund', office: 'Treasury',
  receivedFrom: { ...person }, receivedBy: { ...person },
  items: [{ quantity: 1, unit: 'unit', unitCost: 0, description: 'Office equipment', inventoryItemNo: 'INV-001', estimatedUsefulLife: '5 years' }],
});

test('admin requests for every form reject missing fields before reaching save handlers', () => {
  for (const type of ['iar', 'ics', 'par', 'ptr', 'prs', 'returned-supply', 'property-cards', 'ris', 'suppliers', 'users', 'properties', 'settings', 'profile', 'monthly-item-reports', 'ppe-station-reports']) {
    for (const method of ['POST', 'PUT']) {
      let saved = false;
      let status;
      let response;
      const res = { status(code) { status = code; return this; }, json(body) { response = body; return this; } };
      validateAdminForm(type)({ user: { role: 'admin' }, method, body: {} }, res, () => { saved = true; });
      assert.equal(saved, false, `${type} ${method} must not save`);
      assert.equal(status, 400);
      assert.ok(response.errors.length > 0);
    }
  }
});

test('complete forms pass and spaces-only header, signatory or item fields fail', () => {
  assert.deepEqual(getAdminFormErrors('ics', completeIcs()), []);
  for (const mutate of [
    body => { body.office = '   '; },
    body => { body.receivedBy.name = '\t'; },
    body => { body.items[0].description = '\n '; },
    body => { body.items.push({}); },
  ]) {
    const body = completeIcs(); mutate(body);
    assert.ok(getAdminFormErrors('ics', body).length);
  }
});

test('positive quantities, nonnegative costs, dates and a nonempty item list are enforced', () => {
  for (const mutate of [
    body => { body.items[0].quantity = 0; },
    body => { body.items[0].quantity = -1; },
    body => { body.items[0].unitCost = -1; },
    body => { body.receivedBy.date = 'not-a-date'; },
    body => { body.items = []; },
  ]) {
    const body = completeIcs(); mutate(body);
    assert.ok(getAdminFormErrors('ics', body).length);
  }
});

test('completed PRS receiver corrections remain available and require complete signatories', () => {
  assert.deepEqual(getAdminFormErrors('prs', { returnedTo: person }, 'PUT'), []);
  assert.ok(getAdminFormErrors('prs', { returnedTo: { ...person, name: ' ' } }, 'PUT').length);
});

test('editing a user can retain the password; creating a user requires a password', () => {
  const body = { firstName: 'Cherie', lastName: 'Mae', username: 'cherie', email: 'cherie@example.test', office: 'Treasury', division: 'Finance' };
  assert.deepEqual(getAdminFormErrors('users', body, 'PUT'), []);
  assert.ok(getAdminFormErrors('users', body, 'POST').some(error => error.path === 'password'));
});

test('user workflows retain their existing validation rather than requiring admin document fields', () => {
  let continued = false;
  validateAdminForm('ptr')({ user: { role: 'user' }, method: 'POST', body: {} }, {}, () => { continued = true; });
  assert.equal(continued, true);
});
