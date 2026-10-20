const test = require('node:test');
const assert = require('node:assert/strict');
const allocateUnitSerials = require('../src/utils/allocateUnitSerials');

test('serial numbers are preserved without generated numeric suffixes', async () => {
  assert.deepEqual(await allocateUnitSerials(' 12ceds ', 1), ['12ceds']);
  assert.deepEqual(await allocateUnitSerials('12ceds-10', 1), ['12ceds-10']);
  assert.deepEqual(await allocateUnitSerials('', 10), []);
  assert.deepEqual(await allocateUnitSerials('   ', 10), []);
  await assert.rejects(allocateUnitSerials('12ceds', 10), /Only 1 Qty. per Serial Number/);
});
