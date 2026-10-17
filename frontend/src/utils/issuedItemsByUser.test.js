import test from 'node:test';
import assert from 'node:assert/strict';
import { groupIssuedItemsByUser } from './issuedItemsByUser.js';

test('user folders combine their issued items and keep people with matching names separate', () => {
  const holder = (id, quantity) => ({ id, name: 'Alex', office: 'Treasury', quantity, units: [{ id: `${id}-unit`, risId: 'ris1', quantity }] });
  const items = [
    { id: 'broom', name: 'Broom', unit: 'pcs', holders: [holder('user:1', 3), holder('user:2', 1)] },
    { id: 'printer', name: 'Printer', unit: 'unit', holders: [holder('user:1', 2)] },
  ];
  const folders = groupIssuedItemsByUser(items);
  assert.equal(folders.length, 2);
  assert.equal(folders[0].quantity, 5);
  assert.deepEqual(folders[0].items.map(item => item.name), ['Broom', 'Printer']);
  assert.equal(folders[0].items[0].units[0].risId, 'ris1');
  assert.equal(folders[1].quantity, 1);
  assert.equal(items[0].holders.length, 2);
  assert.deepEqual(groupIssuedItemsByUser([]), []);
});

test('selecting an issued item shows only folders of users holding that item', () => {
  const holder = (id, quantity) => ({ id, name: id, quantity, units: [] });
  const items = [
    { id: 'broom', name: 'Broom', holders: [holder('user:1', 3), holder('user:2', 1)] },
    { id: 'printer', name: 'Printer', holders: [holder('user:1', 2)] },
  ];
  const printerFolders = groupIssuedItemsByUser(items.filter(item => item.id === 'printer'));
  assert.deepEqual(printerFolders.map(folder => folder.id), ['user:1']);
  assert.deepEqual(printerFolders[0].items.map(item => item.name), ['Printer']);
  assert.equal(printerFolders[0].quantity, 2);
  assert.equal(groupIssuedItemsByUser(items.filter(item => item.id === 'broom')).length, 2);
  assert.deepEqual(groupIssuedItemsByUser(items.filter(item => item.id === 'unissued')), []);
});

test('fund filter includes only quantities, documents and user folders charged to the selected fund', async () => {
  const { filterIssuedItemsByFund } = await import('./issuedItemsByUser.js');
  const items = [{ id: 'printer', holders: [
    { id: 'a', name: 'A', quantity: 5, units: [{ fundCluster: 'General Fund', quantity: 2, risId: 'general' }, { fundCluster: 'Trust Fund', quantity: 3, risId: 'trust' }] },
    { id: 'b', name: 'B', quantity: 1, units: [{ fundCluster: 'Trust Fund', quantity: 1 }] },
  ] }];
  const result = filterIssuedItemsByFund(items, 'General Fund');
  assert.equal(result[0].quantity, 2);
  assert.deepEqual(result[0].holders.map(holder => holder.id), ['a']);
  assert.deepEqual(result[0].holders[0].units.map(unit => unit.risId), ['general']);
  assert.deepEqual(filterIssuedItemsByFund(items, 'Missing Fund'), []);
  assert.equal(filterIssuedItemsByFund(items, ''), items);
});

test('all account folders remain after their last issuance is removed', () => {
  const accounts = [{ _id: '1', firstName: 'Catherine', lastName: 'Lagera', office: 'Mayor Office' }, { _id: '2', firstName: 'Cherie', office: 'Supply Office' }];
  const folders = groupIssuedItemsByUser([], accounts);
  assert.equal(folders.length, 2);
  assert.equal(folders[0].name, 'Catherine Lagera');
  assert.equal(folders[0].quantity, 0);
  assert.deepEqual(folders[0].items, []);
  const issued = [{ id: 'printer', holders: [{ id: 'user:1', name: 'Catherine Lagera', office: 'Mayor Office', quantity: 1, units: [] }] }];
  const withItems = groupIssuedItemsByUser(issued, accounts);
  assert.equal(withItems.length, 2);
  assert.equal(withItems[0].quantity, 1);
});
