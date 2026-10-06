import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildAnnualOfficePdf } from '../src/utils/annualOfficePdf.js';

test('annual item documents export office records across multiple landscape pages', async () => {
  const rows = Array.from({ length: 140 }, (_, index) => ({ office: `Office ${index}`, description: 'Air conditioner with a long equipment description', quantity: 1, unit: 'unit', propertyNumber: `AC-${index}`, custodian: 'José Dela Cruz', documentNumber: `PAR-${index}` }));
  const bytes = await buildAnnualOfficePdf({ itemType: 'Air Conditioners', quantity: rows.length, rows }, 2026);
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() > 1);
  for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 842, height: 595 });
});
