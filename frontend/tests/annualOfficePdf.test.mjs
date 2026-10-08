import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildAnnualOfficePdf } from '../src/utils/annualOfficePdf.js';
import { FORM_PDF_A4_LANDSCAPE } from '../src/utils/formPdfStyle.js';
import { inspectReportPdf } from './reportPdfAssertions.mjs';

test('annual item documents export office records across multiple landscape pages', async () => {
  const rows = Array.from({ length: 140 }, (_, index) => ({ office: `Office ${index}`, description: 'Air conditioner with a long equipment description', quantity: 1, unit: 'unit', propertyNumber: `AC-${index}`, custodian: 'José Dela Cruz', documentNumber: `PAR-${index}` }));
  const bytes = await buildAnnualOfficePdf({ itemType: 'Air Conditioners', quantity: rows.length, rows }, 2026);
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() > 1);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_LANDSCAPE)).join('\n');
  assert.ok(text.includes('AC-139'), 'the last record is retained');
});
test('annual office rows longer than a page retain their complete wrapped text', async () => {
  const document = await PDFDocument.load(await buildAnnualOfficePdf({ itemType: 'Equipment', quantity: 1,
    rows: [{ office: 'Office', description: `BEGIN ${'Detailed equipment description '.repeat(200)} END-MARKER`, quantity: 1, unit: 'unit', propertyNumber: 'P-001', custodian: 'Custodian', documentNumber: 'DOC-END' }],
  }, 2026));
  assert.ok(document.getPageCount() > 1);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_LANDSCAPE)).join('\n');
  assert.ok(text.includes('BEGIN'));
  assert.ok(text.includes('END-MARKER'));
});
