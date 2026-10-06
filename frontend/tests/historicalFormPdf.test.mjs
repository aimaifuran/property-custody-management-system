import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } from 'pdf-lib';
import { buildHistoricalFormPdf, FORM_TEMPLATES, templateFieldValue, FORM_PDF_FONT_SIZE } from '../src/utils/historicalFormPdf.js';
const loadTemplate = path => readFile(new URL(`../public${path}`, import.meta.url));

test('every archived form uses its official template and preserves page size', async () => {
  for (const [type, template] of Object.entries(FORM_TEMPLATES)) {
    const bytes = await buildHistoricalFormPdf({ type, details: { entityName: 'Historical Office', description: 'Office chair', quantity: 1, items: [{ description: 'Office chair', quantity: 1 }] } }, loadTemplate);
    const result = await PDFDocument.load(bytes);
    const source = await PDFDocument.load(await loadTemplate(`/forms/templates/${template}-template.pdf`));
    assert.equal(result.getPageCount(), source.getPageCount(), type);
    assert.deepEqual(result.getPage(0).getSize(), source.getPage(0).getSize(), type);
    assert.equal(result.getForm().getFields().length, 0, type);
    for (const [, object] of result.context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && object.get(PDFName.of('Type'))?.toString() === '/Font') {
        const family = object.get(PDFName.of('BaseFont'))?.toString();
        assert.ok(family?.includes('TimesNewRoman'), `${type}: ${family}`);
      }
      if (!(object instanceof PDFRawStream)) continue;
      let content;
      try { content = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1'); } catch { continue; }
      for (const match of content.matchAll(/\/[^\s]+\s+([\d.]+)\s+Tf\b/g)) assert.equal(Number(match[1]), FORM_PDF_FONT_SIZE, `${type}: fixed print/PDF size`);
    }
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
});
