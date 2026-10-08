import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildStationPpePdf, STATION_PPE_COLUMNS, stationMoney } from '../src/utils/ppeStationPdf.js';
import { FORM_PDF_A4_LANDSCAPE } from '../src/utils/formPdfStyle.js';
import { inspectReportPdf } from './reportPdfAssertions.mjs';

const report = { accountGroup: 'ACU', date: '2026-10-05', preparedBy: 'Prepared Person', reviewedBy: 'Review Person', rows: [{ article: 'ACU', description: 'Air conditioner\nS/N: ABC123', propertyNumber: 'P-001', accountablePerson: 'Accountable Person', unitCost: null, totalCost: null, remarks: 'SERVICEABLE' }] };
test('station template has seven columns and leaves unspecified costs blank', () => {
  assert.equal(STATION_PPE_COLUMNS.length, 7);
  assert.equal(STATION_PPE_COLUMNS.reduce((sum, column) => sum + column[2], 0), 100);
  assert.equal(stationMoney(null), '');
  assert.equal(stationMoney(12.5), '12.50');
});
test('PPE report and signature block fit a landscape A4 page', async () => {
  const pdf = await PDFDocument.load(await buildStationPpePdf(report));
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 841.89, height: 595.28 });
  await inspectReportPdf(pdf, FORM_PDF_A4_LANDSCAPE);
});
test('large PPE lists paginate with multiline descriptions and repeated accountable people', async () => {
  const pdf = await PDFDocument.load(await buildStationPpePdf({ ...report, rows: Array.from({ length: 100 }, () => ({ ...report.rows[0], description: 'Air conditioner – café\nS/N: ABC123' })) }));
  assert.ok(pdf.getPageCount() > 1);
  assert.ok(pdf.getPages().every(page => page.getSize().width === 841.89));
  await inspectReportPdf(pdf, FORM_PDF_A4_LANDSCAPE);
});
test('long station descriptions continue without truncating content or overlapping long signatories', async () => {
  const pdf = await PDFDocument.load(await buildStationPpePdf({ ...report,
    governmentUnit: 'LOCAL GOVERNMENT UNIT WITH A LONG MUNICIPALITY NAME '.repeat(3),
    preparedBy: 'Prepared signatory with a long printed name '.repeat(4),
    preparedDesignation: 'Detailed designation and department '.repeat(4),
    reviewedBy: 'Reviewed signatory with a long printed name '.repeat(4),
    reviewedDesignation: 'Detailed designation and department '.repeat(4),
    rows: [{ ...report.rows[0], description: `BEGIN ${'A long equipment specification. '.repeat(200)} END-MARKER` }],
  }));
  assert.ok(pdf.getPageCount() > 1);
  const text = (await inspectReportPdf(pdf, FORM_PDF_A4_LANDSCAPE)).join('\n');
  assert.ok(text.includes('END-MARKER'));
  assert.ok(text.includes('REVIEWED SIGNATORY'));
});
test('oversized station header/signatories cannot extend past the A4 print margins', async () => {
  await assert.rejects(buildStationPpePdf({ ...report, governmentUnit: 'Header '.repeat(2000) }), /header is too long for A4/);
  await assert.rejects(buildStationPpePdf({ ...report, reviewedBy: 'Signatory '.repeat(2000) }), /signatory details are too long for A4/);
});
