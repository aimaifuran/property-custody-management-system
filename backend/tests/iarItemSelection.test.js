const test = require('node:test');
const assert = require('node:assert/strict');
test('IAR existing-item selection shows only distinct item names and keeps unit descriptions separate', async () => {
 const { selectIarStockItem, stockItemOption, stockItemNames } = await import('../../frontend/src/utils/iarItemSelection.js');
 const item = { stockNumber: 'PR-001', category: 'Printer', description: 'Laser printer', unit: 'unit', itemType: 'ASSET', cost: 10000 };
 const row = selectIarStockItem({ quantity: 3, description: 'New printer specifications', serialNumber: '', propertyNumber: '', unitCost: 10000, totalCost: 30000 }, item);
 assert.equal(row.stockPropertyNumber, 'PR-001'); assert.equal(row.propertyPlantAndEquipment, 'Printer');
 assert.equal(row.totalCost, 30000); assert.equal(row.serialNumber, ''); assert.equal(row.inventory, undefined);
 assert.equal(stockItemOption(item), 'Printer');
 assert.equal(row.description, 'New printer specifications');
 assert.deepEqual(stockItemNames([item, { ...item, stockNumber: 'PR-002' }, { category: 'General', description: 'Do not show this description' }]), ['Printer']);
 assert.equal(selectIarStockItem({ quantity: 1, description: '', unitCost: '' }, item).description, '');
});
