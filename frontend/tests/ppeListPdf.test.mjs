import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPpePdf, PPE_COLUMNS, ppeAmount } from '../src/utils/ppeListPdf.js';
import { suppliedPpeReport } from '../src/utils/ppeReference.js';

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
test('a short report generates a legal portrait PDF', async () => {
  const pdf = await PDFDocument.load(await buildPpePdf(report));
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 1008 });
});
test('long reports paginate with wrapped descriptions and supported text', async () => {
  const rows = Array.from({ length: 150 }, (_, index) => ({ ...report.rows[0], item: `Item ${index + 1}: specialty paper with a long description and size specifications – café`, quantity: index + 1, unitCost: 2 }));
  const pdf = await PDFDocument.load(await buildPpePdf({ ...report, rows }));
  assert.ok(pdf.getPageCount() >= 3);
  assert.ok(pdf.getPages().every(page => page.getSize().height === 1008));
});
test('the supplied August report preserves all photographed rows and three-page sequence', async () => {
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
  assert.equal(pdf.getPageCount(), 3);
});
