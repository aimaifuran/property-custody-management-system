import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';

test('PAR print matches the broad description column and unequal signature panels', async () => {
  const runs = [];
  const pdf = await PDFDocument.load(await buildHistoricalFormPdf({ type: 'PAR', details: {
    entityName: 'LGU Carigara', receivedBy: { name: 'Juan Dela Cruz', position: 'End User', date: '2026-11-03' },
    issuedBy: { name: 'Supply Officer', position: 'Supply Officer I', date: '2026-11-03' },
    items: [{ description: 'Office Printer', quantity: 1, unit: 'UNIT', amount: 60000 }],
  } }, undefined, { onDraw: run => runs.push(run) }));
  assert.equal(pdf.getPageCount(), 1);
  const labels = runs.filter(run => run.section === 'signatory caption');
  assert.deepEqual(labels.map(run => run.text), ['Received by:', 'Issued by:']);
  assert.ok(labels[0].cellBounds.width > labels[1].cellBounds.width);
  for (const run of labels) assert.ok(run.x < run.bounds.x + 10);
  assert.ok(runs.some(run => run.text === 'Signature over Printed Name of End User'));
  assert.ok(runs.some(run => run.text === 'Property Custodian'));
  assert.ok(runs.some(run => run.text === 'SUPPLY OFFICER I'));
  const description = runs.find(run => run.section === 'table caption' && run.text === 'Description');
  const amount = runs.find(run => run.section === 'table caption' && run.text === 'Amount');
  assert.ok(description.cellBounds.width >= amount.cellBounds.width * 2.8);
  assert.ok(runs.some(run => run.section === 'table footer caption' && run.text === 'TOTAL'));
  assert.ok(runs.some(run => run.section === 'remarks caption' && run.text === 'Remarks:'));
});
