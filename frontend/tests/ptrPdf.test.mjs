import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPtrPdf } from '../src/utils/ptrPdf.js';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_MARGIN } from '../src/utils/formPdfStyle.js';

function assertLayout(runs) {
  for (const run of runs) {
    assert.equal(run.size, 9);
    assert.ok(run.x >= run.bounds.x, run.text);
    assert.ok(run.x + run.width <= run.bounds.x + run.bounds.width + .01, run.text);
    assert.ok(run.y >= run.bounds.top - run.bounds.height, run.text);
    assert.ok(run.y + run.size <= run.bounds.top, run.text);
    assert.ok(run.x >= run.bounds.x + run.padding - .01, `${run.text}: left padding`);
    assert.ok(run.x + run.width <= run.bounds.x + run.bounds.width - run.padding + .01, `${run.text}: right padding`);
    assert.ok(run.y + run.ascent <= run.bounds.top - run.padding + .01, `${run.text}: top padding`);
    assert.ok(run.y - run.descent >= run.bounds.top - run.bounds.height + run.padding - .01, `${run.text}: bottom padding`);
    assert.ok(run.x >= FORM_PDF_MARGIN, run.text);
    assert.ok(run.x + run.width <= FORM_PDF_A4_PORTRAIT[0] - FORM_PDF_MARGIN + .01, run.text);
    assert.ok(run.y >= FORM_PDF_MARGIN, run.text);
    assert.ok(run.y + run.size <= FORM_PDF_A4_PORTRAIT[1] - FORM_PDF_MARGIN, run.text);
    assert.ok(!/^Page\s+\d|^\d+\s*\/\s*\d+$/.test(run.text), run.text);
  }
  for (let first = 0; first < runs.length; first++) {
    for (let second = first + 1; second < runs.length; second++) {
      const a = runs[first], b = runs[second];
      if (a.page !== b.page) continue;
      const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const vertical = Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y);
      assert.ok(horizontal <= .01 || vertical <= .01, `${a.text} overlaps ${b.text}`);
    }
  }
}

test('PTR header values follow their captions on retained underlines in PDF and print output', async () => {
  const runs = [];
  const details = { entityName: 'LGU Carigara', fundCluster: 'Trust Fund', fromAccountableOfficer: 'Catherine Lagera', toAccountableOfficer: 'Cherie Mae Francisco', ptrNumber: '2026-10-001', date: '2026-10-08', transferType: 'Reassignment', items: [{ description: 'Laptop', propertyNumber: 'P-001', amount: 60000, condition: 'Serviceable' }] };
  const bytes = await buildPtrPdf(details, { onDraw: run => runs.push(run) });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: FORM_PDF_A4_PORTRAIT[0], height: FORM_PDF_A4_PORTRAIT[1] });
  for (const value of ['Trust Fund', 'CATHERINE LAGERA', 'CHERIE MAE FRANCISCO', '2026-10-001', '10/8/2026']) assert.ok(runs.some(run => run.text === value), value);
  for (const caption of ['Entity Name:', 'Fund Cluster:', 'From Accountable Officer/Agency/Fund Cluster:', 'To Accountable Officer/Agency/Fund Cluster:', 'PTR No.:', 'Date:']) {
    const label = runs.find(run => run.section === caption && run.fieldRole === 'label');
    const value = runs.find(run => run.section === caption && run.fieldRole === 'value');
    assert.ok(value.x > label.x + label.width, `${caption}: value follows colon`);
    assert.ok(Math.abs(value.y - label.y) < 1, `${caption}: label and value share a line`);
    assert.ok(value.underline.start.x <= value.x && value.underline.end.x >= value.x + value.width, `${caption}: underline spans value`);
    assert.ok(value.underline.start.y < value.y - value.descent, `${caption}: underline below text`);
  }
  assert.ok(runs.find(run => run.text === 'Trust Fund').y < runs.find(run => run.text === 'LGU Carigara').y, 'Fund Cluster is below Entity Name');
  assertLayout(runs);
  const exported = await PDFDocument.load(await buildHistoricalFormPdf({ type: 'PTR', details }));
  assert.equal(exported.getPageCount(), 1, 'Shared print/download builder uses the corrected PTR layout');
});

test('PTR columns keep dates, property numbers and large amounts intact with balanced cell padding', async () => {
  const runs = [];
  const propertyNumber = 'CARIGARA-PPE-2026-000123';
  const pdf = await PDFDocument.load(await buildPtrPdf({ items: [{ dateAcquired: '2026-10-08', propertyNumber, description: 'Laptop computer with charger and carrying case', amount: 1234567890123.45, condition: 'Serviceable' }] }, { onDraw: run => runs.push(run) }));
  for (const [section, value] of [['item:0', '10/8/2026'], ['item:1', propertyNumber], ['item:3', '1,234,567,890,123.45']]) assert.deepEqual(runs.filter(run => run.section === section).map(run => run.text), [value]);
  assertLayout(runs);
  for (const run of runs.filter(run => ['item:0', 'item:1', 'item:3'].includes(run.section))) {
    const upper = run.bounds.top - (run.y + run.ascent);
    const lower = run.y - run.descent - (run.bounds.top - run.bounds.height);
    assert.ok(Math.abs(upper - lower) < .01, `${run.text}: vertically centered`);
  }
  assert.equal(pdf.getPageCount(), 1);
});

test('long PTR headers and signatories wrap without losing text or overlapping cells', async () => {
  const runs = [];
  const name = 'Cherie Mae Francisco Municipal Treasury and Administrative Services Department';
  const fund = 'Special Projects and Municipal Development Trust Fund';
  await buildPtrPdf({ entityName: 'Municipality of Carigara, Leyte, Philippines', fundCluster: fund, fromAccountableOfficer: name, toAccountableOfficer: name, ptrNumber: 'PROPERTY-TRANSFER-2026-10-000000000001', transferType: 'Relocation', approvedBy: { name, designation: 'Municipal Supply and Property Management Office' }, issuedBy: { name }, receivedBy: { name } }, { onDraw: run => runs.push(run) });
  assert.equal(runs.filter(run => run.section === 'Fund Cluster:' && run.fieldRole === 'value').map(run => run.text).join(' '), fund);
  assert.equal(runs.filter(run => run.section === 'From Accountable Officer/Agency/Fund Cluster:' && run.fieldRole === 'value').map(run => run.text).join(' '), name.toUpperCase());
  assert.equal(runs.filter(run => run.section === 'PTR No.:' && run.fieldRole === 'value').map(run => run.text).join(''), 'PROPERTY-TRANSFER-2026-10-000000000001');
  const wrappedValues = runs.filter(run => run.fieldRole === 'value' && !run.section.startsWith('signatory:'));
  assert.ok(wrappedValues.every(run => run.underline), 'Every wrapped header value line retains its underline');
  assert.ok(runs.some(run => run.text === 'Relocate'));
  assertLayout(runs);
});

test('PTR continuation pages retain every item and repeat the officer headers', async () => {
  const runs = [];
  const items = Array.from({ length: 40 }, (_, index) => ({ description: `Asset ${index}`, propertyNumber: `P-${index}`, amount: index + 1 }));
  const pdf = await PDFDocument.load(await buildPtrPdf({ fromAccountableOfficer: 'Catherine Lagera', toAccountableOfficer: 'Cherie Mae Francisco', items }, { onDraw: run => runs.push(run) }));
  assert.ok(pdf.getPageCount() > 1);
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: FORM_PDF_A4_PORTRAIT[0], height: FORM_PDF_A4_PORTRAIT[1] });
  for (const item of items) assert.equal(runs.filter(run => run.text === item.description).length, 1, item.description);
  assert.equal(runs.filter(run => run.text === 'CATHERINE LAGERA').length, pdf.getPageCount());
  assertLayout(runs);
});

test('PTR signatory captions, names and positions are capitals and every signatory value is centered', async () => {
  const runs = [];
  const person = { name: 'Cherie Mae Francisco Municipal Treasury Department', position: 'Municipal Supply and Property Management Officer', date: '2026-10-08' };
  await buildPtrPdf({ approvedBy: person, issuedBy: 'Catherine Lagera', receivedBy: { ...person, designation: 'Assistant Supply Officer' }, items: [{ description: 'Laptop computer', condition: 'Serviceable' }] }, { onDraw: run => runs.push(run) });
  const signatories = runs.filter(run => run.section.startsWith('signatory:'));
  assert.ok(signatories.length > 0);
  for (const run of signatories) {
    assert.equal(run.text, run.text.toUpperCase());
    assert.ok(Math.abs(run.x - (run.bounds.x + (run.bounds.width - run.width) / 2)) < .01, `${run.text}: centered`);
  }
  assert.equal(signatories.filter(run => run.section === 'signatory:name' && run.fieldRole === 'value').map(run => run.text).join(' '), `${person.name.toUpperCase()} CATHERINE LAGERA ${person.name.toUpperCase()}`);
  assert.ok(signatories.some(run => run.text === '10/8/2026' && run.section === 'signatory:date'));
  assert.ok(runs.some(run => run.text === 'Laptop computer'), 'General item text keeps its original case');
  assertLayout(runs);
});

test('PTR descriptions longer than an A4 page continue without shrinking or losing text', async () => {
  const description = 'Municipal office equipment and replacement parts '.repeat(150).trim();
  const runs = [];
  const pdf = await PDFDocument.load(await buildPtrPdf({ items: [{ description, propertyNumber: 'P-0001', amount: 50000 }] }, { onDraw: run => runs.push(run) }));
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(runs.filter(run => run.section === 'item:2').map(run => run.text).join(' '), description);
  assertLayout(runs);
});
