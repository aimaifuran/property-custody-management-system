import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPpePdf, PPE_COLUMNS, ppeAmount } from '../src/utils/ppeListPdf.js';
import { suppliedPpeReport } from '../src/utils/ppeReference.js';
import { FORM_PDF_A4_PORTRAIT } from '../src/utils/formPdfStyle.js';
import { inspectReportPdf } from './reportPdfAssertions.mjs';

const report = {
  serialNumber: '2026-008-0008', lgu: 'CARIGARA, LEYTE', fund: '',
  periodStart: '2026-08-01', periodEnd: '2026-08-31', reportDate: '2026-09-05',
  custodian: 'RALPH M. SAVERET JR.', accountingStaff: '', postedDate: '',
  rows: [{ risNumber: '2026-08-001', responsibilityCenter: 'HRMO', stockNumber: '', item: 'FACE & FINGERPRINT BIOMETRIC', unit: 'UNIT', quantity: 1, unitCost: null }],
};
test('the eight reference columns fill the table and blank costs remain blank', () => {
  assert.equal(PPE_COLUMNS.length, 8);
  assert.equal(PPE_COLUMNS.reduce((total, column) => total + column[2], 0), 100);
  assert.equal(ppeAmount(report.rows[0]), '');
  assert.equal(ppeAmount({ quantity: 3, unitCost: 12.5 }), '37.50');
  assert.equal(ppeAmount({ quantity: 3, unitCost: 0 }), '0.00');
});
test('a short report fits portrait A4 at readable size without page numbering', async () => {
  const pdf = await PDFDocument.load(await buildPpePdf(report));
  assert.equal(pdf.getPageCount(), 1);
  await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT);
});
test('long reports paginate with wrapped descriptions and supported text', async () => {
  const rows = Array.from({ length: 150 }, (_, index) => ({ ...report.rows[0], item: `Item ${index + 1}: specialty paper with a long description and size specifications – café`, quantity: index + 1, unitCost: 2 }));
  const pdf = await PDFDocument.load(await buildPpePdf({ ...report, rows }));
  assert.ok(pdf.getPageCount() >= 3);
  const text = (await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT)).join('\n');
  assert.ok(text.includes('Item 150:'), 'the last record is retained');
});
test('the supplied August report preserves all photographed rows with readable fixed-size pagination', async () => {
  assert.equal(suppliedPpeReport.rows.length, 100);
  assert.equal(suppliedPpeReport.recapitulation.length, 38);
  assert.equal(suppliedPpeReport.rows[51].item, 'PAIL, LARGE');
  assert.equal(suppliedPpeReport.rows[52].item, 'ROOM FRESHENER');
  assert.equal(suppliedPpeReport.rows.at(-1).item, 'PINS/THUMBTACKS');
  assert.equal(suppliedPpeReport.recapitulation[11].item, 'PVC ID CARD BLANK');
  assert.equal(suppliedPpeReport.recapitulation.find(row => row.item === 'BOND PAPER, LONG SUBS.20').quantity, 94);
  assert.equal(suppliedPpeReport.recapitulation.find(row => row.item === 'BOND PAPER, SHORT SUBS.20').quantity, 76);
  assert.ok(suppliedPpeReport.rows.every(row => row.unitCost === '' && row.stockNumber === ''));
  const pdf = await PDFDocument.load(await buildPpePdf(suppliedPpeReport));
  assert.ok(pdf.getPageCount() >= 3);
  const text = (await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT)).join('\n');
  assert.ok(text.includes('PINS/THUMBTACKS'));
  assert.ok(text.includes('Recapitulation'));
});
test('an oversized supplies description continues across A4 sheets with its final text intact', async () => {
  const pdf = await PDFDocument.load(await buildPpePdf({ ...report, custodian: 'Custodian with a long printed name '.repeat(3), accountingStaff: 'Accounting staff with a long printed name '.repeat(3), rows: [{ ...report.rows[0], item: `BEGIN ${'A detailed description with specifications. '.repeat(100)} END-MARKER` }] }));
  assert.ok(pdf.getPageCount() > 1);
  const text = (await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT)).join('\n');
  assert.ok(text.includes('BEGIN'));
  assert.ok(text.includes('END-MARKER'));
});
test('impossible header or signatory lengths fail clearly instead of clipping the A4 sheet', async () => {
  await assert.rejects(buildPpePdf({ ...report, lgu: 'Header '.repeat(2000) }), /header is too long for A4/);
  await assert.rejects(buildPpePdf({ ...report, custodian: 'Custodian '.repeat(2000) }), /signatory details are too long for A4/);
});
