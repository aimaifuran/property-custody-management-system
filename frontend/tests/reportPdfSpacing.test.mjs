import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPpePdf } from '../src/utils/ppeListPdf.js';
import { buildStationPpePdf } from '../src/utils/ppeStationPdf.js';
import { buildAnnualOfficePdf } from '../src/utils/annualOfficePdf.js';
import { buildReportsPdf } from '../src/utils/reportsPdf.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_A4_PORTRAIT } from '../src/utils/formPdfStyle.js';
import { inspectReportCells, inspectReportPdf } from './reportPdfAssertions.mjs';

test('supplies table centers headings/IDs/units, left aligns descriptions and right aligns full quantities and money', async () => {
  const events = [];
  const pdf = await PDFDocument.load(await buildPpePdf({ lgu: 'LGU Carigara', periodStart: '2026-10-01', periodEnd: '2026-10-31', reportDate: '2026-10-08', serialNumber: '001', rows: [
    { risNumber: '2026-10-001', responsibilityCenter: 'Municipal Office', stockNumber: '003', item: 'Paper with size specifications and a lengthy description that wraps naturally.', unit: 'REAMS', quantity: 5, unitCost: 105000 },
  ] }, { onDraw: event => events.push(event) }));
  inspectReportCells(events, FORM_PDF_A4_PORTRAIT);
  await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT);
  const body = events.filter(event => event.kind === 'cellText' && !event.cell.header);
  assert.ok(body.some(event => event.text === '2026-10-001'), 'RIS number remains intact');
  assert.ok(body.some(event => event.text === 'REAMS'), 'unit remains intact');
  assert.ok(body.some(event => event.text === '105000.00' && event.cell.align === 'right'), 'unit cost remains intact and right aligned');
  assert.ok(body.some(event => event.text === '525000.00' && event.cell.align === 'right'), 'amount remains intact and right aligned');
  assert.ok(body.some(event => event.cell.column === 3 && event.cell.align === 'left'));
});

test('station table wraps long text inside padded rows and continuation cells without losing the final value', async () => {
  const events = [];
  const pdf = await PDFDocument.load(await buildStationPpePdf({ accountGroup: 'Office Equipment', date: '2026-10-08', preparedBy: 'Supply Officer', reviewedBy: 'Office Head', rows: [
    { article: 'Printer', description: `BEGIN ${'Detailed specifications including models and size. '.repeat(120)} END-MARKER`, propertyNumber: '2026-PR-003', accountablePerson: 'Catherine Lagera', unitCost: 105000, totalCost: 525000, remarks: 'SERVICEABLE' },
  ] }, { onDraw: event => events.push(event) }));
  inspectReportCells(events, FORM_PDF_A4_LANDSCAPE);
  const text = (await inspectReportPdf(pdf, FORM_PDF_A4_LANDSCAPE)).join('\n');
  assert.ok(pdf.getPageCount() > 1);
  assert.ok(text.includes('END-MARKER'));
  assert.ok(text.includes('105000.00'));
  assert.ok(text.includes('SERVICEABLE'), 'the condition remains a complete word');
});

test('annual office table uses padded aligned cells for wrapped names and descriptions', async () => {
  const events = [];
  const pdf = await PDFDocument.load(await buildAnnualOfficePdf({ itemType: 'Equipment', quantity: 1, rows: [
    { office: 'Municipal Office With A Long Department Name', description: 'A printer with a lengthy equipment description including specifications and model details.', quantity: 1, unit: 'Pieces', propertyNumber: '2026-PROP-003', custodian: 'Catherine Lagera', documentNumber: '2026-10-001' },
  ] }, 2026, { onDraw: event => events.push(event) }));
  inspectReportCells(events, FORM_PDF_A4_LANDSCAPE);
  await inspectReportPdf(pdf, FORM_PDF_A4_LANDSCAPE);
});

test('monthly transactions and annual report records share measured cell padding', async () => {
  const forms = [
    ['IAR', 'Inspection and Acceptance Report'], ['PROPERTY CARD', 'Property Card'], ['RIS', 'Requisition and Issue Slip'],
    ['ICS', 'Inventory Custodian Slip'], ['PAR', 'Property Acknowledgement Receipt'], ['PTR', 'Property Transfer Report'],
    ['PRS', 'Property Return Slip'], ['RETURNED SUPPLY', 'Returned Supply'],
  ].map(([value, label]) => ({ value, label }));
  const records = forms.map((form, index) => ({ type: form.value, documentNumber: `2026-10-00${index + 1}`, entityName: 'LGU Carigara', reportDate: '2026-10-08', status: 'RECORDED' }));
  for (const annual of [false, true]) {
    const events = [];
    const pdf = await PDFDocument.load(await buildReportsPdf({ annual, title: annual ? 'Annual Reports' : 'Monthly reports', periodLabel: 'October 2026', monthName: 'October', year: 2026, forms, records, onDraw: event => events.push(event) }, async () => { throw new Error('No logo'); }));
    inspectReportCells(events, FORM_PDF_A4_PORTRAIT);
    await inspectReportPdf(pdf, FORM_PDF_A4_PORTRAIT);
    assert.equal(pdf.getPageCount(), 1);
  }
});
