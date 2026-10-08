import { PDFRawStream, decodePDFRawStream, rgb } from 'pdf-lib';
import { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';

// The source IAR places these three boxes below their captions. Keep the
// official captions and table, replacing only the boxes and selected marks.
const choices = [
  { key: 'inspection', textX: 125.66, baseline: 207.74, rectangle: '415.102 771.832 75.2227 69.5781' },
  { key: 'Complete', textX: 356.95, baseline: 206.54, rectangle: '1392.63 787.375 75.2266 64.25' },
  { key: 'Partial', textX: 356.95, baseline: 181.58, rectangle: '1389.67 679.293 75.6484 82.375' },
];

export function alignIarTemplateCheckboxes(document, font, acceptanceStatus) {
  const removed = new Map(choices.map(choice => [choice.key, 0]));
  for (const [reference, stream] of document.context.enumerateIndirectObjects()) {
    if (!(stream instanceof PDFRawStream)) continue;
    let content;
    try { content = Array.from(decodePDFRawStream(stream).decode(), byte => String.fromCharCode(byte)).join(''); } catch { continue; }
    let changed = false;
    for (const choice of choices) {
      const rectangle = choice.rectangle.replaceAll('.', '\\.').replaceAll(' ', '\\s+');
      content = content.replace(new RegExp(`${rectangle}\\s+re\\s+(?:f\\*|S)`, 'g'), () => {
        changed = true;
        removed.set(choice.key, removed.get(choice.key) + 1);
        return '';
      });
    }
    if (!changed) continue;
    const attributes = Object.fromEntries(stream.dict.entries()
      .filter(([key]) => !['/Length', '/Filter', '/DecodeParms'].includes(key.toString()))
      .map(([key, value]) => [key.decodeText(), value]));
    document.context.assign(reference, document.context.flateStream(Uint8Array.from(content, character => character.charCodeAt(0)), attributes));
  }
  if (choices.some(choice => removed.get(choice.key) !== 2)) throw new Error('Unable to align the IAR inspection and acceptance checkboxes');

  const size = 11;
  const ascent = font.heightAtSize(FORM_PDF_FONT_SIZE, { descender: false });
  const descent = font.heightAtSize(FORM_PDF_FONT_SIZE) - ascent;
  const centerOffset = (ascent - descent) / 2;
  const page = document.getPage(0);
  for (const choice of choices) {
    const x = choice.textX - size - 8;
    const y = choice.baseline + centerOffset - size / 2;
    page.drawRectangle({ x, y, width: size, height: size, borderWidth: 0.65, borderColor: rgb(0, 0, 0) });
    if (acceptanceStatus !== choice.key) continue;
    page.drawLine({ start: { x: x + 2, y: y + 5.5 }, end: { x: x + 4.5, y: y + 3 }, thickness: 1, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: x + 4.5, y: y + 3 }, end: { x: x + 9, y: y + 8 }, thickness: 1, color: rgb(0, 0, 0) });
  }
}
