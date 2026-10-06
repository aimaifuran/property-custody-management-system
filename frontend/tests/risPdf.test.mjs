import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildRisPdf } from '../src/utils/risPdf.js';
import { createFormPdfCache } from '../src/utils/formPdfCache.js';

test('RIS text stays inside its header fields, table cells and signatory cells', async () => {
  const runs = [];
  const data = { entityName: 'Municipality of Carigara', fundCluster: 'General Fund', division: 'Leyte', office: 'Mayor Office', responsibilityCenterCode: '001', risNumber: 'RIS-001', purpose: 'Office', items: [{ stockNumber: 'fdgd', unit: 'csscsss', description: 'dvdfgddsdgsdfg', quantityRequested: 2, isAvailable: false }], requestedBy: { name: 'Catherine Lagera', designation: 'Mayor Office', date: '2026-10-06' }, approvedBy: { name: 'Ralph Saveret', designation: 'Supply Officer' }, issuedBy: { name: 'Ralph Saveret', designation: 'Supply Officer' }, receivedBy: { name: 'Catherine Lagera', designation: 'Mayor Office' } };
  const bytes = await buildRisPdf(data, { onDraw: run => runs.push(run) });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  for (const run of runs) {
    assert.equal(run.size, 9);
    assert.ok(run.x >= run.bounds.x, run.text);
    assert.ok(run.x + run.width <= run.bounds.x + run.bounds.width, run.text);
    assert.ok(run.y >= run.bounds.top - run.bounds.height, run.text);
    assert.ok(run.y + run.size <= run.bounds.top, run.text);
  }
  const entity = runs.find(run => run.text === 'Municipality of Carigara');
  const label = runs.find(run => run.text === 'Entity Name:');
  assert.ok(entity.x > label.x + label.width);
  assert.ok(runs.some(run => run.text === 'Received by:'));
});

test('RIS descriptions wrap at one fixed font size and retain all text', async () => {
  const description = 'Air conditioning unit '.repeat(15).trim();
  const runs = [];
  await buildRisPdf({ items: [{ description, quantityRequested: 1 }] }, { onDraw: run => runs.push(run) });
  const lines = runs.filter(run => run.bounds.width === 144).map(run => run.text);
  assert.equal(lines.filter(line => line !== 'Description').join(' '), description);
});

test('print and preview share a PDF; edited records generate fresh bytes', async () => {
  let builds = 0;
  const get = createFormPdfCache(async () => new Uint8Array([++builds]));
  const record = { type: 'RIS', details: { risNumber: 'RIS-1' } };
  const first = get(record); const second = get(record);
  assert.equal(first, second);
  assert.deepEqual(await second, new Uint8Array([1]));
  assert.deepEqual(await get({ type: 'RIS', details: { risNumber: 'RIS-2' } }), new Uint8Array([2]));
});

test('a failed PDF generation can be retried', async () => {
  let attempts = 0;
  const get = createFormPdfCache(async () => { if (++attempts === 1) throw new Error('Network error'); return new Uint8Array([1]); });
  await assert.rejects(get({ type: 'RIS' }));
  assert.deepEqual(await get({ type: 'RIS' }), new Uint8Array([1]));
});
