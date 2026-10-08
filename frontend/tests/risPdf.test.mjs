import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildRisPdf } from '../src/utils/risPdf.js';
import { createFormPdfCache } from '../src/utils/formPdfCache.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_MARGIN } from '../src/utils/formPdfStyle.js';

function assertA4Layout(pdf, runs) {
  const [width, height] = FORM_PDF_A4_PORTRAIT;
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width, height });
  for (const run of runs) {
    assert.equal(run.size, 9);
    assert.ok(run.x >= Math.max(run.bounds.x, FORM_PDF_MARGIN), run.text);
    assert.ok(run.x + run.width <= Math.min(run.bounds.x + run.bounds.width + .01, width - FORM_PDF_MARGIN), run.text);
    assert.ok(run.y >= Math.max(run.bounds.top - run.bounds.height, FORM_PDF_MARGIN), run.text);
    assert.ok(run.y + run.size <= Math.min(run.bounds.top, height - FORM_PDF_MARGIN), run.text);
    assert.ok(run.x >= run.bounds.x + run.padding - .01, `${run.text}: left padding`);
    assert.ok(run.x + run.width <= run.bounds.x + run.bounds.width - run.padding + .01, `${run.text}: right padding`);
    assert.ok(run.y + run.ascent <= run.bounds.top - run.padding + .01, `${run.text}: top padding`);
    assert.ok(run.y - run.descent >= run.bounds.top - run.bounds.height + run.padding - .01, `${run.text}: bottom padding`);
    assert.ok(!/^Page\s+\d|^\d+\s*\/\s*\d+$/.test(run.text), run.text);
  }
}

test('RIS text stays inside its header fields, table cells and signatory cells', async () => {
  const runs = [];
  const data = { entityName: 'Municipality of Carigara', fundCluster: 'General Fund', division: 'Leyte', office: 'Mayor Office', responsibilityCenterCode: '001', risNumber: 'RIS-001', purpose: 'Office', items: [{ stockNumber: 'fdgd', unit: 'csscsss', description: 'dvdfgddsdgsdfg', quantityRequested: 2, isAvailable: false }], requestedBy: { name: 'Catherine Lagera', designation: 'Mayor Office', date: '2026-10-06' }, approvedBy: { name: 'Ralph Saveret', designation: 'Supply Officer' }, issuedBy: { name: 'Ralph Saveret', designation: 'Supply Officer' }, receivedBy: { name: 'Catherine Lagera', designation: 'Mayor Office' } };
  const bytes = await buildRisPdf(data, { onDraw: run => runs.push(run) });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assertA4Layout(pdf, runs);
  const entity = runs.find(run => run.text === 'Municipality of Carigara');
  const label = runs.find(run => run.text === 'Entity Name:');
  assert.ok(entity.x > label.x + label.width);
  assert.ok(runs.some(run => run.text === 'RECEIVED BY:'));
});

test('RIS signatory captions, names and positions are capitals and values stay centered', async () => {
  const runs = [];
  const name = 'Cherie Mae Francisco Municipal Treasury Department';
  const designation = 'Municipal Supply and Property Management Officer';
  const data = { requestedBy: { name, designation, date: '2026-10-08' }, approvedBy: 'Catherine Lagera', issuedBy: { name: 'Ralph Saveret', position: 'Supply Officer' }, receivedBy: { name: 'Cherie Mae Francisco' }, items: [{ description: 'Printer supplies', unit: 'Packages', quantityRequested: 2 }] };
  const pdf = await PDFDocument.load(await buildRisPdf(data, { onDraw: run => runs.push(run) }));
  const signatories = runs.filter(run => run.section.startsWith('signatory:'));
  assert.ok(signatories.length > 0);
  for (const run of signatories) {
    assert.equal(run.text, run.text.toUpperCase());
    assert.ok(Math.abs(run.x - (run.bounds.x + (run.bounds.width - run.width) / 2)) < .01, `${run.text}: centered`);
  }
  assert.equal(signatories.filter(run => run.section === 'signatory:name' && run.fieldRole === 'value').map(run => run.text).join(' '), `${name.toUpperCase()} CATHERINE LAGERA RALPH SAVERET CHERIE MAE FRANCISCO`);
  assert.ok(signatories.some(run => run.text === '10/8/2026' && run.section === 'signatory:date'));
  assert.ok(runs.some(run => run.text === 'Printer supplies'), 'General item text keeps its original case');
  assertA4Layout(pdf, runs);
});

test('RIS columns keep stock identifiers, units and large quantities readable with padded cells', async () => {
  const runs = [];
  const stockNumber = 'SUPPLY-2026-000123';
  const requested = '123456789012', issued = '999999999999';
  const pdf = await PDFDocument.load(await buildRisPdf({ items: [{ stockNumber, unit: 'Packages', description: 'Printer supplies with replacement parts', quantityRequested: requested, quantityIssued: issued, isAvailable: true, remarks: 'For municipal office use' }] }, { onDraw: run => runs.push(run) }));
  for (const [section, value] of [['item:0', stockNumber], ['item:1', 'Packages'], ['item:3', requested], ['item:6', issued]]) assert.deepEqual(runs.filter(run => run.section === section).map(run => run.text), [value]);
  assertA4Layout(pdf, runs);
  for (const run of runs.filter(run => run.section.startsWith('item:'))) {
    const upper = run.bounds.top - (run.y + run.ascent);
    const lower = run.y - run.descent - (run.bounds.top - run.bounds.height);
    if (run.section !== 'item:2' && run.section !== 'item:7') assert.ok(Math.abs(upper - lower) < .01, `${run.text}: vertically centered`);
  }
});

test('RIS descriptions wrap at one fixed font size and retain all text', async () => {
  const description = 'Air conditioning unit - office replacement parts '.repeat(15).trim();
  const runs = [];
  await buildRisPdf({ items: [{ description, quantityRequested: 1 }] }, { onDraw: run => runs.push(run) });
  const lines = runs.filter(run => run.section === 'item:2').map(run => run.text);
  assert.equal(lines.join(' '), description);
});

test('RIS continuation pages preserve every item without page-number footers', async () => {
  const runs = [];
  const items = Array.from({ length: 40 }, (_, index) => ({ stockNumber: `ST-${index}`, description: `Supply ${index}`, quantityRequested: index + 1 }));
  const pdf = await PDFDocument.load(await buildRisPdf({ items }, { onDraw: run => runs.push(run) }));
  assert.ok(pdf.getPageCount() > 1);
  for (const item of items) assert.equal(runs.filter(run => run.text === item.description).length, 1, item.description);
  assertA4Layout(pdf, runs);
});

test('RIS descriptions longer than an A4 page continue at readable size without truncation', async () => {
  const description = 'Municipal office equipment and replacement parts '.repeat(220).trim();
  const runs = [];
  const pdf = await PDFDocument.load(await buildRisPdf({ items: [{ description, quantityRequested: 1 }] }, { onDraw: run => runs.push(run) }));
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(runs.filter(run => run.section === 'item:2').map(run => run.text).join(' '), description);
  assertA4Layout(pdf, runs);
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
