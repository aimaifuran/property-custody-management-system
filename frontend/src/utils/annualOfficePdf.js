import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_FONT_SIZE } from './historicalFormPdf.js';
import { PDFDocument, rgb } from 'pdf-lib';

const printable = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ');
export async function buildAnnualOfficePdf(group, year) {
  const pdf = await PDFDocument.create();
  const { regular: font, bold } = await embedFormFonts(pdf);
  const columns = [{ title: 'Office', width: 135 }, { title: 'Description', width: 185 }, { title: 'Qty', width: 35 }, { title: 'Unit', width: 45 }, { title: 'Property / stock no.', width: 115 }, { title: 'Custodian', width: 130 }, { title: 'Document', width: 137 }];
  let page; let y;
  const wrap = (value, width) => {
    const lines = [''];
    for (const word of printable(value).split(/\s+/)) {
      const last = lines.length - 1;
      if (font.widthOfTextAtSize(`${lines[last]} ${word}`.trim(), FORM_PDF_FONT_SIZE) <= width - 10) {
        lines[last] = `${lines[last]} ${word}`.trim();
      } else if (font.widthOfTextAtSize(word, FORM_PDF_FONT_SIZE) <= width - 10) {
        lines.push(word);
      } else {
        if (lines[last]) lines.push('');
        for (const character of word) {
          const index = lines.length - 1;
          if (font.widthOfTextAtSize(lines[index] + character, FORM_PDF_FONT_SIZE) > width - 10) lines.push(character);
          else lines[index] += character;
        }
      }
    }
    return lines;
  };
  const nextPage = () => {
    page = pdf.addPage([842, 595]); y = 557;
    page.drawText(printable(`Annual Office Items - ${year}`), { x: 30, y, size: FORM_PDF_FONT_SIZE, font: bold });
    y -= 20;
    page.drawText(printable(`${group.itemType} | Total quantity: ${group.quantity}`), { x: 30, y, size: FORM_PDF_FONT_SIZE, font: bold });
    y -= 22; let x = 30;
    for (const column of columns) { page.drawText(column.title, { x: x + 4, y, size: FORM_PDF_FONT_SIZE, font: bold }); x += column.width; }
    y -= 10;
  };
  nextPage();
  for (const row of group.rows) {
    const values = [row.office, row.description, row.quantity, row.unit, row.propertyNumber || row.stockNumber || '-', row.custodian || '-', row.documentNumber];
    const lines = values.map((value, index) => wrap(value, columns[index].width));
    const height = Math.max(...lines.map(value => value.length)) * 11 + 10;
    if (y - height < 40) nextPage();
    let x = 30;
    columns.forEach((column, index) => {
      page.drawRectangle({ x, y: y - height, width: column.width, height, borderWidth: 0.4, borderColor: rgb(.7, .75, .72) });
      lines[index].forEach((line, lineIndex) => page.drawText(line, { x: x + 4, y: y - 13 - lineIndex * 11, size: FORM_PDF_FONT_SIZE, font }));
      x += column.width;
    });
    y -= height;
  }
  pdf.getPages().forEach((sheet, index) => sheet.drawText(`Page ${index + 1} of ${pdf.getPageCount()}`, { x: 30, y: 20, size: FORM_PDF_FONT_SIZE, font }));
  return pdf.save();
}
