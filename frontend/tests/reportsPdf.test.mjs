import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildReportsPdf } from '../src/utils/reportsPdf.js';
import { FORM_PDF_A4_PORTRAIT } from '../src/utils/formPdfStyle.js';
import { inspectReportPdf } from './reportPdfAssertions.mjs';

const forms = [
  ['IAR', 'Inspection and Acceptance Report'], ['PROPERTY CARD', 'Property Card'],
  ['RIS', 'Requisition and Issue Slip'], ['ICS', 'Inventory Custodian Slip'],
  ['PAR', 'Property Acknowledgement Receipt'], ['PTR', 'Property Transfer Report'],
  ['PRS', 'Property Return Slip'], ['RETURNED SUPPLY', 'Returned Supply'],
].map(([value, label]) => ({ value, label }));
const options = { annual: false, title: 'Monthly reports', periodLabel: 'September 2026', year: 2026, monthName: 'September', forms, selectedForm: 'ALL', records: [] };
const noLogo = async () => { throw new Error('No logo'); };

test('all monthly labels, sections and signatories fit A4 without truncation or page counters', async () => {
  const document = await PDFDocument.load(await buildReportsPdf(options, noLogo));
  assert.equal(document.getPageCount(), 1);
  const text = (await inspectReportPdf(document, FORM_PDF_A4_PORTRAIT)).join('\n');
  for (const form of forms) assert.ok(text.includes(form.label), form.label);
  assert.ok(text.includes('APPROVED BY:'));
});
test('monthly summary accommodates large totals and a selected form', async () => {
  const records = Array.from({ length: 10000 }, (_, index) => ({ type: forms[index % forms.length].value }));
  for (const selectedForm of ['ALL', 'IAR']) {
    const document = await PDFDocument.load(await buildReportsPdf({ ...options, records, selectedForm }, noLogo));
    assert.equal(document.getPageCount(), 1);
    const text = (await inspectReportPdf(document, FORM_PDF_A4_PORTRAIT)).join('\n');
    assert.ok(text.includes('10000'));
    assert.ok(text.includes('Inspection and Acceptance Report'));
  }
});
test('annual reports repeat headers and wrap every full record across A4 pages', async () => {
  const records = Array.from({ length: 120 }, (_, index) => ({ type: 'PROPERTY CARD', documentNumber: `DOCUMENT-NUMBER-WITHOUT-TRUNCATION-${index}`, entityName: 'Municipal Office With A Long Department Name', reportDate: '2026-10-08', status: 'PENDING_REVIEW' }));
  const document = await PDFDocument.load(await buildReportsPdf({ ...options, annual: true, title: 'Annual Reports', periodLabel: '2026', records }, noLogo));
  assert.ok(document.getPageCount() > 1);
  const pages = await inspectReportPdf(document, FORM_PDF_A4_PORTRAIT);
  for (const text of pages) assert.ok(text.includes('Issued reports recorded: 120'));
  assert.ok(pages.join('\n').replace(/\s/g, '').includes('DOCUMENT-NUMBER-WITHOUT-TRUNCATION-119'));
});
