import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } from 'pdf-lib';
import { buildHistoricalFormPdf, FORM_TEMPLATES, templateFieldValue, FORM_PDF_FONT_SIZE } from '../src/utils/historicalFormPdf.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_A4_PORTRAIT } from '../src/utils/formPdfStyle.js';
import { TEMPLATE_CELL_PADDING } from '../src/utils/templatePdfLayout.js';
import { isFormSignatoryField } from '../src/utils/formPdfSignatories.js';
const loadTemplate = path => readFile(new URL(`../public${path}`, import.meta.url));

test('every archived form retains official fields on exact A4 pages without page numbers', async () => {
  for (const [type, template] of Object.entries(FORM_TEMPLATES)) {
    const bytes = await buildHistoricalFormPdf({ type, details: { entityName: 'Historical Office', description: 'Office chair', quantity: 1, items: [{ description: 'Office chair', quantity: 1 }] } }, loadTemplate);
    const result = await PDFDocument.load(bytes);
    const source = await PDFDocument.load(await loadTemplate(`/forms/templates/${template}-template.pdf`));
    assert.equal(result.getPageCount(), source.getPageCount(), type);
    const [width, height] = type === 'PROPERTY CARD' ? FORM_PDF_A4_LANDSCAPE : FORM_PDF_A4_PORTRAIT;
    assert.deepEqual(result.getPage(0).getSize(), { width, height }, type);
    assert.deepEqual(result.getPage(0).getCropBox(), { x: 0, y: 0, width, height }, type);
    assert.equal(result.getForm().getFields().length, 0, type);
    for (const [, object] of result.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && object.get(PDFName.of('Type'))?.toString() === '/Font') {
        const family = object.get(PDFName.of('BaseFont'))?.toString();
        assert.ok(family?.includes('TimesNewRoman'), `${type}: ${family}`);
      }
      if (!(object instanceof PDFRawStream)) continue;
      let content;
      try { content = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); } catch { continue; }
      assert.ok(!/\bTm\s*\(169\)Tj/.test(content), 'rotated Property Card handbook pagination removed');
      for (const block of content.matchAll(/BT\b([\s\S]*?)\bET/g)) {
        const position = block[1].match(/[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm\b/);
        if (position) assert.ok(![39.6, 40.08, 40.32].includes(Number(position[2])) && !(Number(position[1]) === 53.64 && Number(position[2]) === 300.55), `${type}: printed handbook pagination is gone`);
      }
      for (const match of content.matchAll(/\/[^\s]+\s+([\d.]+)\s+Tf\b/g)) assert.equal(Number(match[1]), FORM_PDF_FONT_SIZE, `${type}: fixed print/PDF size`);
    }
  }
});

test('fixed official table rows wrap long entries and continue without repeating quantities', async () => {
  for (const type of ['IAR', 'PROPERTY CARD', 'ICS', 'PAR', 'PRS']) {
    const runs = [];
    const description = 'Office equipment with installation and extended maintenance services '.repeat(5).trim();
    const items = Array.from({ length: 8 }, (_, index) => ({ description, remarks: description, quantity: index + 101, receiptQuantity: index + 101, unit: 'Pieces', unitCost: 35000, totalCost: 600000, amount: 600000, totalValue: 600000 }));
    const document = await PDFDocument.load(await buildHistoricalFormPdf({ type, details: { items } }, loadTemplate, { onDraw: run => runs.push(run) }));
    assert.ok(document.getPageCount() > 1, type);
    const quantityField = type === 'PROPERTY CARD' ? 'receiptQuantity' : 'quantity';
    assert.equal(runs.filter(run => run.section === quantityField).length, items.length, `${type}: one quantity per item`);
    for (const run of runs) {
      assert.equal(run.size, 9);
      assert.ok(run.x >= run.bounds.x - .01 && run.x + run.width <= run.bounds.x + run.bounds.width + .01, `${type}: ${run.text}`);
      assert.ok(run.y - (run.height - run.ascent) >= run.bounds.y - .01 && run.y + run.ascent <= run.bounds.y + run.bounds.height + .01, `${type}: ${run.text}`);
      if (run.cellBounds) {
        const { cellBounds } = run;
        assert.ok(run.x >= cellBounds.x + TEMPLATE_CELL_PADDING - .01 && run.x + run.width <= cellBounds.x + cellBounds.width - TEMPLATE_CELL_PADDING + .01, `${type}: horizontal cell spacing for ${run.text}`);
        assert.ok(run.y - (run.height - run.ascent) >= cellBounds.y + TEMPLATE_CELL_PADDING - .01 && run.y + run.ascent <= cellBounds.y + cellBounds.height - TEMPLATE_CELL_PADDING + .01, `${type}: vertical cell spacing for ${run.text}`);
      }
    }
    const column = type === 'PROPERTY CARD' ? 'remarks' : 'description';
    assert.equal(runs.filter(run => run.section === column).map(run => run.text).join(' '), items.map(() => description).join(' '), `${type}: every description retained`);
    if (type === 'ICS') {
      assert.equal(runs.filter(run => run.text === '35,000.00').length, items.length, 'unit cost remains intact');
      assert.equal(runs.filter(run => run.text === '600,000.00').length, items.length, 'total cost remains intact');
    }
  }
});

test('long headers, signatories and oversized numeric values retain full values on A4', async () => {
  const runs = [];
  const name = 'Cherie Mae Francisco Municipal Treasury and Administrative Services Department';
  const number = 'HISTORICAL-DOCUMENT-'.repeat(14);
  const document = await PDFDocument.load(await buildHistoricalFormPdf({ type: 'IAR', details: { iarNumber: number, entityName: name, inspectedBy: name, acceptedBy: name, items: [{ quantity: 12345678901234567890, description: 'Equipment' }] } }, loadTemplate, { onDraw: run => runs.push(run) }));
  assert.ok(document.getPageCount() >= 2);
  for (const section of ['entityName', 'inspectedBy', 'acceptedBy']) assert.equal(runs.filter(run => run.section === section && !run.text.endsWith('…') && !run.text.endsWith(':')).map(run => run.text).join(' '), section === 'entityName' ? name : name.toUpperCase());
  assert.equal(runs.filter(run => run.section === 'iarNumber' && !run.text.endsWith('…') && !run.text.endsWith(':')).map(run => run.text).join(''), number);
  assert.ok(runs.some(run => run.section === 'quantity' && run.text === String(12345678901234567890)));
  for (const run of runs) assert.ok(run.x + run.width <= document.getPage(run.page).getWidth() - 28 + .01, run.text);
  for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 595.28, height: 841.89 });
});

test('PAR captions and ordinary PRS amounts fit their table columns without extra sheets', async () => {
  for (const type of ['PAR', 'PRS']) {
    const runs = [];
    const details = {
      entityName: 'LGU Carigara', lguName: 'LGU Carigara', purpose: 'Repair',
      items: [{ quantity: 2, unit: 'Pieces', description: 'Printer', amount: 70000, propertyNumber: '003', mrNumber: '003', endUser: 'Admin', unitValue: 35000, totalValue: 70000 }],
    };
    const document = await PDFDocument.load(await buildHistoricalFormPdf({ type, details }, loadTemplate, { onDraw: run => runs.push(run) }));
    assert.equal(document.getPageCount(), 1, type);
    assert.ok(runs.some(run => run.section === 'unit' && run.text === 'Pieces'), `${type}: units stay whole`);
    if (type === 'PRS') assert.ok(runs.some(run => run.section === 'unitValue' && run.text === '35,000.00'));
    if (type === 'PAR') {
      assert.ok(runs.some(run => run.section === 'table caption' && run.text === 'Quantity'));
      assert.ok(runs.some(run => run.section === 'remarks caption' && run.text === 'Remarks:'));
      assert.equal(runs.filter(run => run.section === 'property custodian caption').map(run => run.text).join(' '), 'SIGNATURE OVER PRINTED NAME OF PROPERTY CUSTODIAN');
    }
    for (const run of runs) assert.ok(run.x >= run.bounds.x - .01 && run.x + run.width <= run.bounds.x + run.bounds.width + .01, `${type}: ${run.text}`);
  }
});

test('RIS export retains every item on continuation pages', async () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ stockNumber: `MANUAL-${i}`, description: `Item ${i}`, quantityRequested: 1 }));
  const result = await PDFDocument.load(await buildHistoricalFormPdf({ type: 'RIS', details: { risNumber: 'RIS-OLD', items } }, loadTemplate));
  assert.equal(result.getPageCount(), 3);
  assert.equal(templateFieldValue('stockNumber1', {}, items.slice(38)), 'MANUAL-38');
});
test('historical values, blank fields and signatories map without fabricated values', () => {
  const data = { entityName: 'Original agency', fundCluster: 'General Fund', returnedBy: { name: 'Juan Dela Cruz' }, returnedTo: { name: 'Supply Officer', designation: 'Admin' }, items: [{ amount: 100 }] };
  assert.equal(templateFieldValue('entityName', data, []), 'Original agency');
  assert.equal(templateFieldValue('returnedToName2', data, []), 'Supply Officer');
  assert.equal(templateFieldValue('endUser1', data, [{}]), 'Juan Dela Cruz');
  assert.equal(templateFieldValue('yes1', data, [{}]), '');
  assert.equal(templateFieldValue('stockNumber1', data, [{ stockNumber: null }]), '');
  assert.equal(templateFieldValue('totalAmount', data, []), '100.00');
  assert.equal(templateFieldValue('inspectionDate', data, []), '');
  assert.equal(templateFieldValue('totalAmount', { totalValue: 250 }, []), '250.00');
  assert.equal(templateFieldValue('purpose', { _template: 'prs', purpose: 'Repair' }, []), '');
  assert.equal(templateFieldValue('other', { _template: 'ptr', transferType: 'Return to Supply' }, []), '/');
  assert.equal(templateFieldValue('acceptedBy', { custodian: 'Supply Officer' }, []), 'Supply Officer');
});

test('official forms use the A4 width and keep metadata and certification text separated', async () => {
  for (const type of ['IAR', 'PROPERTY CARD', 'ICS', 'PAR', 'PRS', 'RETURNED SUPPLY']) {
    const runs = [];
    const person = { name: 'Catherine Lagera', position: 'Supply Officer I', date: '2026-10-08' };
    const details = {
      entityName: 'LGU Carigara', lguName: 'LGU Carigara', fundCluster: 'Trust Fund', office: 'Supply Office',
      iarNumber: '005', poNumber: 'PN-003', poDate: '2026-10-01', iarDate: '2026-10-08',
      invoiceNumber: 'INV-003', invoiceDate: '2026-10-08', supplierName: 'Office Equipment Store', requisitioningOffice: 'Requested office', responsibilityCenterCode: '004',
      inspectionDate: '2026-10-08', acceptanceDate: '2026-10-08', inspectedBy: person.name, custodian: person.name, acceptanceStatus: 'Complete',
      month: '2026-10-01', propertyPlantAndEquipment: 'Property', propertyNumber: '003', description: 'Printer', serialNumber: '003',
      icsNumber: '2026-10-003', parNumber: '2026-10-003', prsNumber: '2026-10-003', purpose: 'Returned To Stock',
      receivedFrom: person, receivedBy: person, issuedBy: person, returnedBy: person, returnedTo: person,
      items: [{ stockNumber: '003', description: 'Printer', unit: 'Pieces', quantity: 2, unitCost: 35000, totalCost: 70000, inventoryItemNo: '003', estimatedUsefulLife: '5 years', propertyNumber: '003', dateAcquired: '2026-10-01', amount: 70000, mrNumber: '003', endUser: person.name, unitValue: 35000, totalValue: 70000, date: '2026-10-08', receiptQuantity: 3, referenceParNo: '003', balanceQuantity: 3 }],
    };
    const document = await PDFDocument.load(await buildHistoricalFormPdf({ type, details }, loadTemplate, { onDraw: run => runs.push(run) }));
    assert.equal(document.getPageCount(), 1, type);
    const cells = runs.filter(run => run.section === 'table caption').map(run => run.cellBounds);
    assert.equal(Math.min(...cells.map(cell => cell.x)), 28, type);
    assert.ok(Math.abs(Math.max(...cells.map(cell => cell.x + cell.width)) - (document.getPage(0).getWidth() - 28)) < .001, `${type}: full usable width`);
    if (type === 'ICS' || type === 'PAR') {
      assert.ok(!runs.some(run => run.section === 'office' || run.section === 'office caption'), `${type}: office is removed from PDF`);
      const entity = runs.find(run => run.section === 'entityName');
      const fund = runs.find(run => run.section === 'fundCluster');
      assert.ok(fund.y < entity.y && Math.abs(fund.bounds.x - entity.bounds.x) < 10, `${type}: fund cluster is below entity name`);
      assert.ok(runs.some(run => run.section === 'fundCluster' && run.text === details.fundCluster));
    }
    if (type === 'IAR') {
      assert.ok(!runs.some(run => run.section === 'reqOffice' || run.section === 'reqOffice caption'), 'requisitioning office is removed from IAR PDF');
      assert.ok(runs.some(run => run.section === 'rcc' && run.text === details.responsibilityCenterCode));
    }
    if (type === 'PRS' || type === 'RETURNED SUPPLY') {
      assert.ok(runs.some(run => run.section === 'prsNumber' && run.text === details.prsNumber));
      assert.ok(runs.some(run => run.section === 'returnedByPosition' && run.text === person.position.toUpperCase()));
      assert.ok(runs.some(run => run.section === 'form title' && run.text === 'PROPERTY RETURN SLIP'));
    }
    for (const run of runs) {
      const bottom = run.y + run.ascent - run.height;
      assert.ok(run.x >= 28 - .01 && run.x + run.width <= document.getPage(run.page).getWidth() - 28 + .01, `${type}: A4 horizontal margins: ${run.text}`);
      assert.ok(bottom >= 28 - .01 && run.y + run.ascent <= document.getPage(run.page).getHeight() - 28 + .01, `${type}: A4 vertical margins: ${run.text}`);
      if (isFormSignatoryField(run.section) || ['signatory caption', 'signature field caption', 'property custodian caption', 'certification caption', 'certification statement'].includes(run.section)) {
        assert.equal(run.text, run.text.toUpperCase(), `${type}: uppercase signatory ${run.text}`);
        assert.ok(Math.abs(run.x + run.width / 2 - (run.bounds.x + run.bounds.width / 2)) < .01, `${type}: centered signatory ${run.text}`);
      }
    }
    for (const [index, first] of runs.entries()) for (const second of runs.slice(index + 1)) {
      if (first.page !== second.page) continue;
      const xOverlap = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
      const yOverlap = Math.min(first.y + first.ascent, second.y + second.ascent) - Math.max(first.y + first.ascent - first.height, second.y + second.ascent - second.height);
      assert.ok(xOverlap <= .01 || yOverlap <= .01, `${type}: text overlaps: ${first.text} / ${second.text}`);
    }
  }
});
