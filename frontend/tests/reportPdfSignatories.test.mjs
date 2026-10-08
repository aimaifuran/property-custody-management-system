import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPpePdf, ppeDate } from '../src/utils/ppeListPdf.js';
import { buildStationPpePdf, stationDate } from '../src/utils/ppeStationPdf.js';
import { buildReportsPdf } from '../src/utils/reportsPdf.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_A4_PORTRAIT } from '../src/utils/formPdfStyle.js';
import { inspectReportPdf } from './reportPdfAssertions.mjs';

function inspectSignatories(events, dimensions) {
  const signatures = events.filter(event => event.kind === 'signature' && event.text);
  assert.ok(signatures.length > 0);
  for (const event of signatures) {
    const { bounds } = event;
    assert.ok(Math.abs(event.x + event.width / 2 - bounds.x - bounds.width / 2) < .001, `${event.text}: horizontally centered`);
    assert.ok(event.x >= bounds.x + 4 - .001, `${event.text}: clear left inset`);
    assert.ok(event.x + event.width <= bounds.x + bounds.width - 4 + .001, `${event.text}: clear right inset`);
    assert.ok(event.y >= bounds.y + 4 - .001, `${event.text}: clear bottom inset`);
    assert.ok(event.y + event.height <= bounds.y + bounds.height - 4 + .001, `${event.text}: clear top inset`);
    assert.ok(event.x >= 28 && event.y >= 28);
    assert.ok(event.x + event.width <= dimensions[0] - 28 + .001);
    assert.ok(event.y + event.height <= dimensions[1] - 28 + .001);
    if (!event.value.startsWith('DATE:')) assert.equal(event.text, event.text.toUpperCase(), 'signatory text uses capitals');
  }
  return signatures;
}

function assertFullValue(events, value) {
  const groups = new Map();
  for (const event of events.filter(event => event.kind === 'signature' && event.value === value)) {
    if (!groups.has(event.bounds)) groups.set(event.bounds, []);
    groups.get(event.bounds).push(event.text);
  }
  assert.ok(groups.size > 0, 'the signature value appears in the PDF');
  for (const texts of groups.values()) assert.equal(texts.join('').replace(/\s/g, ''), value.replace(/\s/g, ''), 'wrapped signatory retains every character');
}

test('supplies report uses centered capital signatory captions and complete long names while preserving date and table text', async () => {
  const events = [];
  const custodian = 'Catherine Lagera Municipal Supply And Property Officer '.repeat(3).trim();
  const accountingStaff = 'Cherie Mae Francisco Accounting Staff '.repeat(3).trim();
  const report = { lgu: 'LGU Carigara', periodStart: '2026-10-01', periodEnd: '2026-10-31', reportDate: '2026-10-08', serialNumber: '001', postedDate: '2026-10-08', custodian: { name: custodian }, accountingStaff: { name: accountingStaff }, rows: [{ risNumber: '2026-10-001', item: 'Printer with original mixed case description', unit: 'Pieces', quantity: 1, unitCost: 35000 }] };
  const original = JSON.stringify(report);
  const document = await PDFDocument.load(await buildPpePdf(report, { onDraw: event => events.push(event) }));
  inspectSignatories(events, FORM_PDF_A4_PORTRAIT);
  assertFullValue(events, custodian.toUpperCase());
  assertFullValue(events, accountingStaff.toUpperCase());
  assertFullValue(events, `DATE: ${ppeDate(report.postedDate)}`);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_PORTRAIT)).join('\n');
  assert.ok(text.includes('POSTED BY:'));
  assert.ok(text.includes('Printer with original'));
  assert.ok(text.includes('Pieces'));
  assert.equal(JSON.stringify(report), original, 'original input data is preserved');
});

test('station report centers and capitalizes long names/designations and signature labels', async () => {
  const events = [];
  const preparedBy = 'Dion Mark Bolido Supply Property Officer '.repeat(4).trim();
  const reviewedBy = 'Catherine Lagera Municipal Office Head '.repeat(4).trim();
  const designation = 'Detailed Designation And Department '.repeat(4).trim();
  const report = { accountGroup: 'Equipment', date: '2026-10-08', preparedBy: { name: preparedBy }, preparedDesignation: designation, reviewedBy: { name: reviewedBy }, reviewedDesignation: designation, rows: [{ article: 'Printer', description: 'Office printer', propertyNumber: 'P-003', accountablePerson: 'Mixed Case Accountable Person', remarks: 'Serviceable' }] };
  const document = await PDFDocument.load(await buildStationPpePdf(report, { onDraw: event => events.push(event) }));
  inspectSignatories(events, FORM_PDF_A4_LANDSCAPE);
  assertFullValue(events, preparedBy.toUpperCase());
  assertFullValue(events, reviewedBy.toUpperCase());
  assertFullValue(events, designation.toUpperCase());
  assertFullValue(events, `DATE: ${stationDate(report.date)}`);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_LANDSCAPE)).join('\n');
  assert.ok(text.includes('PREPARED BY:'));
  assert.ok(text.includes('REVIEWED BY:'));
  assert.ok(text.includes('Mixed Case Accountable Person'), 'table people retain their entered casing');
  assert.ok(text.includes('Serviceable'), 'table remarks retain their entered casing');
});

test('monthly report signature labels use centered capitals while regular report captions keep their casing', async () => {
  const events = [];
  const document = await PDFDocument.load(await buildReportsPdf({ annual: false, title: 'Monthly reports', periodLabel: 'October 2026', year: 2026, monthName: 'October', forms: [{ value: 'IAR', label: 'Inspection and Acceptance Report' }], records: [], onDraw: event => events.push(event) }, async () => { throw new Error('No logo'); }));
  const signatures = inspectSignatories(events, FORM_PDF_A4_PORTRAIT);
  assert.deepEqual(signatures.map(event => event.text), ['PREPARED BY:', 'REVIEWED BY:', 'APPROVED BY:']);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_PORTRAIT)).join('\n');
  assert.ok(text.includes('Inspection and Acceptance Report'));
});
