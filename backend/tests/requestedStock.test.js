const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRequestedStock } = require('../src/utils/validateRequestedStock');
test('requests cannot exceed available stock, including combined rows', () => {
  const stocks = [{ stockNumber: 'P', name: 'Pencil', quantityOnHand: 5 }];
  assert.doesNotThrow(() => checkRequestedStock([{ stockNumber: 'P', quantityRequested: 5 }], stocks));
  assert.throws(() => checkRequestedStock([{ stockNumber: 'P', quantityRequested: 6 }], stocks), /available stock \(5\)/);
  assert.throws(() => checkRequestedStock([{ stockNumber: 'P', quantityRequested: 3 }, { stockNumber: 'P', quantityRequested: 3 }], stocks), /exceeds/);
});
