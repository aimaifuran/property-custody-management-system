import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccountableOwner, getIssuedSourceRows, matchSourceRowsToAccountabilities } from './ptrIssuedItems.js';

test('matches source record inventory to active accountable users without requiring acceptance timestamp', () => {
  const [matches] = matchSourceRowsToAccountabilities(
    [{ inventory: 'inventory-1', propertyPlantAndEquipment: 'Keyboard' }],
    [
      {
        _id: 'accountability-1',
        inventory: { _id: 'inventory-1', item: { name: 'Keyboard' } },
        user: 'user-1',
        employee: 'Assigned User',
        active: true,
        quantity: 1,
        quantityRemaining: 1,
      },
      {
        _id: 'accountability-2',
        inventory: { _id: 'inventory-2', item: { name: 'Keyboard' } },
        active: true,
        quantity: 1,
        quantityRemaining: 1,
      },
    ],
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]._id, 'accountability-1');
});

test('matches a source record by stock item name when inventory references are unavailable', () => {
  const [matches] = matchSourceRowsToAccountabilities(
    [{ propertyPlantAndEquipment: 'Keyboard' }],
    [{
      _id: 'accountability-1',
      inventory: { _id: 'inventory-1', item: { name: 'Keyboard' } },
      user: 'user-1',
      active: true,
      quantity: 1,
      quantityRemaining: 1,
    }],
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]._id, 'accountability-1');
});

test('keeps only source rows matched to items currently issued to users', () => {
  const issued = {
    _id: 'accountability-issued',
    inventory: { _id: 'inventory-issued', item: { name: 'Laptop' } },
    user: 'user-1',
    active: true,
    quantity: 1,
    quantityRemaining: 1,
  };
  const returned = {
    _id: 'accountability-returned',
    inventory: { _id: 'inventory-returned', item: { name: 'Monitor' } },
    user: 'user-2',
    active: false,
    quantity: 1,
    quantityRemaining: 0,
  };
  const rows = [
    { inventory: 'inventory-issued', propertyPlantAndEquipment: 'Laptop', acceptedQuantity: 1 },
    { inventory: 'inventory-not-issued', propertyPlantAndEquipment: 'Printer', acceptedQuantity: 1 },
    { inventory: 'inventory-returned', propertyPlantAndEquipment: 'Monitor', acceptedQuantity: 1 },
  ];

  assert.deepEqual(getIssuedSourceRows(rows, [issued, returned]), [rows[0]]);
});

test('gets accountable officer from assigned employee when user is not in active people list', () => {
  assert.deepEqual(
    getAccountableOwner({ user: 'user-1', employee: 'Assigned Custodian' }, []),
    { userId: 'user-1', name: 'Assigned Custodian' },
  );
});
