const test = require('node:test');
const assert = require('node:assert/strict');
const { formSignatories, validateFormSignatories } = require('../src/utils/formSignatories');

test('settings expose all form roles separately and retain only safe name/designation fields', () => {
  const initial = formSignatories({ rememberedSignatories: { inspectedBy: { name: 'Inspector' }, returnedBy: { name: 'Previous recipient' } }, signatories: { approvedBy: { name: 'Approver', designation: 'Head' } } });
  assert.equal(initial.iar.inspectedBy.name, 'Inspector');
  assert.equal(initial.prs.returnedBy.name, '');
  assert.equal(initial.ris.approvedBy.name, 'Approver');
  initial.ris.approvedBy = { name: ' RIS Approver ', designation: ' Office Head ', malicious: 'ignored' };
  initial.ptr.approvedBy.name = 'Transfer Approver';
  const saved = validateFormSignatories(initial);
  assert.deepEqual(saved.ris.approvedBy, { name: 'RIS Approver', designation: 'Office Head' });
  assert.equal(saved.ptr.approvedBy.name, 'Transfer Approver');
  assert.equal(formSignatories({ formSignatories: saved }).ris.approvedBy.name, 'RIS Approver');
});

test('bad settings do not overwrite valid signatories', () => {
  assert.throws(() => validateFormSignatories(null));
  assert.throws(() => validateFormSignatories({}));
  const values = formSignatories();
  values.iar.inspectedBy.name = 'x'.repeat(201);
  assert.throws(() => validateFormSignatories(values), /200/);
  values.iar.inspectedBy.name = { name: 'Invalid' };
  assert.throws(() => validateFormSignatories(values));
});
