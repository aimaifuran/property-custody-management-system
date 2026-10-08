import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormPdfCache } from '../src/utils/formPdfCache.js';

test('preview and print share one generation for equivalent nested record values', async () => {
  let builds = 0;
  const bytes = new Uint8Array([1, 2, 3]);
  const get = createFormPdfCache(async () => { builds++; return bytes; });
  const preview = get({ type: 'IAR', details: { iarNumber: '003', inspectedBy: { name: 'Officer', designation: 'Supply' }, items: [{ unit: 'Pieces', quantity: 2 }] } });
  const print = get({ type: 'IAR', details: { items: [{ quantity: 2, unit: 'Pieces' }], inspectedBy: { designation: 'Supply', name: 'Officer' }, iarNumber: '003' } });
  assert.equal(preview, print);
  assert.equal(await preview, bytes);
  assert.equal(builds, 1);
});

test('editing a pending record produces fresh bytes without changing its original snapshot', async () => {
  const get = createFormPdfCache(async record => new TextEncoder().encode(record.details.items[0].description));
  const record = { type: 'PAR', details: { items: [{ description: 'Original equipment' }] } };
  const original = get(record);
  record.details.items[0].description = 'Edited equipment';
  const edited = get(record);
  assert.notEqual(original, edited);
  assert.equal(new TextDecoder().decode(await original), 'Original equipment');
  assert.equal(new TextDecoder().decode(await edited), 'Edited equipment');
});

test('active PDF work is retained while completed cache entries are evicted', async () => {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let builds = 0;
  const get = createFormPdfCache(async record => { builds++; await ready; return new Uint8Array([record.details.id]); }, 1);
  const records = [1, 2, 3].map(id => ({ type: 'ICS', details: { id } }));
  const pending = records.map(get);
  assert.equal(get(records[0]), pending[0], 'Cache pressure must not duplicate unfinished work');
  release();
  await Promise.all(pending);
  assert.equal(builds, 3);
  assert.equal(get(records[2]), pending[2], 'Newest completed output remains cached');
  assert.notEqual(get(records[0]), pending[0], 'Evicted completed output is regenerated');
  await get(records[0]);
  assert.equal(builds, 4);
});

test('failed PDF work can retry and changed item order generates fresh output', async () => {
  let attempts = 0;
  const get = createFormPdfCache(async record => {
    if (++attempts === 1) throw new Error('Unable to load a required asset');
    return new Uint8Array(record.details.items);
  });
  const record = { type: 'PROPERTY CARD', details: { items: [1, 2] } };
  await assert.rejects(get(record));
  assert.deepEqual(await get(record), new Uint8Array([1, 2]));
  assert.deepEqual(await get({ ...record, details: { items: [2, 1] } }), new Uint8Array([2, 1]));
  assert.equal(attempts, 3);
});
