import assert from 'node:assert/strict';
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import { embedFormFonts } from '../src/utils/formPdfFonts.js';
import { FORM_PDF_FONT_SIZE, FORM_PDF_MARGIN } from '../src/utils/formPdfStyle.js';
import { REPORT_CELL_PADDING } from '../src/utils/reportPdfLayout.js';

const streamText = stream => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
let metrics;
export async function inspectReportPdf(document, dimensions) {
  metrics ||= PDFDocument.create().then(embedFormFonts);
  const fonts = await metrics;
  const result = [];
  for (const page of document.getPages()) {
    const size = page.getSize();
    assert.deepEqual(size, { width: dimensions[0], height: dimensions[1] });
    const contents = page.node.lookup(PDFName.of('Contents'));
    const references = contents instanceof PDFArray ? contents.asArray() : [contents];
    const drawing = references.map(reference => streamText(document.context.lookup(reference))).join('\n');
    const resources = page.node.Resources().lookup(PDFName.of('Font'));
    const characterMaps = new Map();
    for (const [name, reference] of resources.entries()) {
      const dictionary = document.context.lookup(reference);
      const cmap = streamText(dictionary.lookup(PDFName.of('ToUnicode')));
      const characters = new Map(Array.from(cmap.matchAll(/<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]+)>/g), match => [match[1].toUpperCase(), String.fromCodePoint(parseInt(match[2], 16))]));
      const family = dictionary.get(PDFName.of('BaseFont')).toString();
      characterMaps.set(name.toString().slice(1), { characters, font: family.includes('Bold') ? fonts.bold : family.includes('Italic') ? fonts.italic : fonts.regular });
    }
    const texts = Array.from(drawing.matchAll(/\/([^\s]+) ([\d.]+) Tf\s+[\d.]+ TL\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-F]*)> Tj/g), match => {
      const { characters, font } = characterMaps.get(match[1]);
      const text = (match[5].match(/.{4}/g) || []).map(value => characters.get(value) || '?').join('');
      const fontSize = Number(match[2]), x = Number(match[3]), y = Number(match[4]);
      assert.equal(fontSize, FORM_PDF_FONT_SIZE, 'reports retain a readable fixed font size');
      assert.ok(x >= FORM_PDF_MARGIN - .001, `${text}: left print margin`);
      assert.ok(x + font.widthOfTextAtSize(text, fontSize) <= size.width - FORM_PDF_MARGIN + .001, `${text}: right print margin`);
      assert.ok(y >= FORM_PDF_MARGIN, `${text}: bottom print margin`);
      assert.ok(y + font.heightAtSize(fontSize, { descender: false }) <= size.height - FORM_PDF_MARGIN + .001, `${text}: top print margin`);
      return text;
    });
    const text = texts.join('\n');
    assert.ok(!/\bPage\s+\d+(?:\s+of\s+\d+)?\b/i.test(text), 'no printed page number');
    result.push(text);
  }
  return result;
}

export function inspectReportCells(events, dimensions) {
  const cells = events.filter(event => event.kind === 'cell');
  assert.ok(cells.length > 0, 'the report draws table cells');
  for (const cell of cells) {
    assert.equal(cell.padding, REPORT_CELL_PADDING);
    assert.ok(cell.x >= FORM_PDF_MARGIN - .001 && cell.y >= FORM_PDF_MARGIN - .001, 'cell stays inside the print margins');
    assert.ok(cell.x + cell.width <= dimensions[0] - FORM_PDF_MARGIN + .001);
    assert.ok(cell.y + cell.height <= dimensions[1] - FORM_PDF_MARGIN + .001);
    const texts = events.filter(event => event.kind === 'cellText' && event.cell === cell && event.text);
    for (const text of texts) {
      assert.ok(text.x >= cell.x + cell.padding - .001, `${text.text}: left cell padding`);
      assert.ok(text.x + text.width <= cell.x + cell.width - cell.padding + .001, `${text.text}: right cell padding`);
      assert.ok(text.y >= cell.y + cell.padding - .001, `${text.text}: bottom cell padding`);
      assert.ok(text.y + text.height <= cell.y + cell.height - cell.padding + .001, `${text.text}: top cell padding`);
      if (cell.align === 'left') assert.ok(Math.abs(text.x - cell.x - cell.padding) < .001, `${text.text}: left aligned text`);
      if (cell.align === 'right') assert.ok(Math.abs(text.x + text.width - cell.x - cell.width + cell.padding) < .001, `${text.text}: right aligned amount`);
    }
    if (texts.length) {
      const first = texts[0], last = texts.at(-1);
      const topGap = cell.y + cell.height - first.y - first.height;
      const bottomGap = last.y - cell.y;
      assert.ok(Math.abs(topGap - bottomGap) < .001, 'cell text has balanced vertical spacing');
    }
  }
  return cells;
}
