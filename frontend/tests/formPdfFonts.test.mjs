import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { embedFormFonts, preloadFormFonts } from '../src/utils/formPdfFonts.js';

test('repeated font requests reuse document fonts while independent PDFs retain separate subsets', async () => {
  await preloadFormFonts(['regular', 'bold']);
  const first = await PDFDocument.create(), second = await PDFDocument.create();
  const [one, repeated] = await Promise.all([embedFormFonts(first, ['regular', 'bold']), embedFormFonts(first, ['regular'])]);
  const two = await embedFormFonts(second, ['regular']);
  assert.equal(one.regular, repeated.regular);
  assert.notEqual(one.regular, two.regular);
  first.addPage().drawText('ABC municipal supplies', { font: one.regular, size: 9 });
  second.addPage().drawText('XYZ municipal equipment', { font: two.regular, size: 9 });
  for (const [document, font, required] of [[first, one.regular, '0041'], [second, two.regular, '0058']]) {
    const loaded = await PDFDocument.load(await document.save());
    const dictionary = loaded.context.lookup(font.ref, PDFDict);
    const cmap = dictionary.lookup(PDFName.of('ToUnicode'), PDFRawStream);
    assert.ok(Buffer.from(decodePDFRawStream(cmap).decode()).toString('latin1').includes(required));
    assert.ok(dictionary.get(PDFName.of('BaseFont')).toString().includes('TimesNewRoman'));
  }
});

test('font width reuse preserves exact sizes, Unicode measurements and argument validation', async () => {
  const first = await embedFormFonts(await PDFDocument.create(), ['regular']);
  const second = await embedFormFonts(await PDFDocument.create(), ['regular']);
  const text = 'José Dela Cruz — municipal property';
  const width = first.regular.widthOfTextAtSize(text, 9);
  assert.equal(second.regular.widthOfTextAtSize(text, 9), width);
  assert.ok(Math.abs(second.regular.widthOfTextAtSize(text, 12) - width * 12 / 9) < 1e-9);
  assert.throws(() => second.regular.widthOfTextAtSize(new String(text), 9));
  assert.throws(() => second.regular.widthOfTextAtSize(text, '9'));
});
