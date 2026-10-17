const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/utils/iarItemCatalog');

test('IAR catalog includes unissued and depleted items, deduplicates names and retains units', () => {
  const reports = [{ items: [
    { stockNumber: 'P1', propertyPlantAndEquipment: 'Printer', unit: 'pcs', itemType: 'ASSET' },
    { stockNumber: 'P1', propertyPlantAndEquipment: 'Printer', unit: 'pcs', itemType: 'ASSET' },
    { propertyPlantAndEquipment: 'Broom', unit: 'pcs', itemType: 'ASSET' },
    { stockNumber: 'OLD', description: 'Legacy paper', unit: 'ream', itemType: 'SUPPLY' },
  ] }];
  const stocks = [{ stockNumber: 'P1', name: 'Printer', unit: 'pcs', category: 'General', itemType: 'ASSET', quantityOnHand: 0 }];
  const result = catalog(reports, stocks);
  assert.deepEqual(result.map(row => row.name), ['Broom', 'Legacy paper', 'Printer']);
  assert.equal(result[2].id, JSON.stringify(['printer', 'pcs', 'ASSET']));
  assert.deepEqual(catalog([], stocks), []);
});
