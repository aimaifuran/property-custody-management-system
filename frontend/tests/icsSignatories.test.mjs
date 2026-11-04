import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';

test('ICS signature captions match the sample casing and alignment', async () => {
  const runs = [];
  await buildHistoricalFormPdf({ type: 'ICS', details: {
    receivedFrom: { name: 'Supply Officer', position: 'Property Custodian', date: '2026-11-03' },
    receivedBy: { name: 'Juan Dela Cruz', position: 'Office Staff', date: '2026-11-03' },
    items: [{ description: 'Printer', quantity: 1 }],
  } }, undefined, { onDraw: run => runs.push(run) });
  assert.deepEqual(runs.filter(run => run.section === 'signatory caption').map(run => run.text), ['Received from:', 'Received by:']);
  const captions = runs.filter(run => run.section === 'signature field caption');
  assert.deepEqual(captions.map(run => run.text), ['Signature over Printed name', 'Position/Office', 'Date', 'Signature over Printed name', 'Position/Office', 'Date']);
  for (const run of runs.filter(run => run.section === 'signatory caption')) assert.ok(run.x < run.bounds.x + 10);
  for (const run of captions) assert.ok(Math.abs(run.x + run.width / 2 - run.bounds.x - run.bounds.width / 2) < .01);
  assert.ok(runs.some(run => run.text === 'JUAN DELA CRUZ' && run.section === 'receivedByName'));
});
