import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildHistoricalFormPdf } from '../src/utils/historicalFormPdf.js';
import { FORM_PDF_A4_LANDSCAPE } from '../src/utils/formPdfStyle.js';

test('Property Card PDF and print use the supplied bordered Appendix 69 template', async () => {
  const runs = [], decorations = [];
  const bytes = await buildHistoricalFormPdf({ type: 'PROPERTY CARD', details: {
    entityName: 'LGU Barugo', fundCluster: 'General Fund', propertyPlantAndEquipment: 'Printer',
    description: 'Black laser printer', propertyNumber: 'PC-001', serialNumber: '45241-1', month: '2026-10', poNumber: 'PO-007',
    items: [{ date: '2026-10-14', referenceParNo: 'PAR-001', receiptQuantity: 1, itdQuantity: 0, balanceQuantity: 1, amount: 10000, remarks: 'Received' }],
  } }, undefined, { onDraw: run => runs.push(run), onDecoration: run => decorations.push(run) });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: FORM_PDF_A4_LANDSCAPE[0], height: FORM_PDF_A4_LANDSCAPE[1] });
  assert.ok(runs.some(run => run.text === 'Appendix 69'));
  assert.ok(runs.some(run => run.text === 'PROPERTY CARD'));
  const title = decorations.find(run => run.section === 'title background');
  assert.deepEqual(title.color, [1, 1, 0]);
  assert.equal(title.bounds.x, 28);
  assert.equal(title.bounds.width, FORM_PDF_A4_LANDSCAPE[0] - 56);
  for (const key of ['entityName', 'fundCluster', 'propertyPlantAndEquipment', 'description', 'propertyNumber']) assert.ok(runs.some(run => run.section === key), key);
  for (const key of ['month', 'poNumber', 'serialNumber']) assert.ok(!runs.some(run => run.section === `${key} caption`), `No extra ${key} field in the supplied template`);
  assert.ok(runs.some(run => run.section === 'description' && run.text.includes('S/N: 45241-1')), 'Serial identity stays in property details');
  assert.equal(runs.find(run => run.section === 'entityName caption').y, runs.find(run => run.section === 'fundCluster caption').y);
  assert.ok(runs.find(run => run.section === 'description caption').y < runs.find(run => run.section === 'propertyPlantAndEquipment caption').y);
  for (const text of ['Receipt', 'Issue/Transfer/Disposal', 'Balance']) assert.ok(runs.some(run => run.section === 'table group caption' && run.text === text), text);
  assert.ok(runs.some(run => run.section === 'amount' && run.text === '10,000.00'));
  const contents = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream).flatMap(([, object]) => {
    try { return [Buffer.from(decodePDFRawStream(object).decode()).toString('latin1')]; } catch { return []; }
  }).join('\n');
  assert.ok(contents.includes('1 1 0 rg'), 'Actual PDF has a yellow title rectangle');
});

test('Property Card repeats the template on continuation pages without dropping transactions', async () => {
  const runs = [], decorations = [];
  const items = Array.from({ length: 50 }, (_, index) => ({ date: '2026-10-14', referenceParNo: `RIS-${index}`, itdQuantity: 1, balanceQuantity: 50 - index, amount: 100, remarks: `Movement ${index}` }));
  const pdf = await PDFDocument.load(await buildHistoricalFormPdf({ type: 'PROPERTY CARD', details: { entityName: 'LGU Barugo', items } }, undefined, { onDraw: run => runs.push(run), onDecoration: run => decorations.push(run) }));
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(decorations.length, pdf.getPageCount());
  assert.equal(runs.filter(run => run.section === 'referenceParNo').length, 50);
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: FORM_PDF_A4_LANDSCAPE[0], height: FORM_PDF_A4_LANDSCAPE[1] });
});
