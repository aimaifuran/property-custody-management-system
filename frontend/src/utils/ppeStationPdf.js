import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_FONT_SIZE } from './historicalFormPdf.js';
import { PDFDocument, rgb } from 'pdf-lib';

export const STATION_PPE_COLUMNS = [
  ['article', 'ARTICLE/ITEM', 11], ['description', 'DESCRIPTION', 33],
  ['propertyNumber', 'NEW PROPERTY NO. ASSIGNED', 15], ['accountablePerson', 'PERSON ACCOUNTABLE', 18],
  ['unitCost', 'UNIT COST/VALUE', 7], ['totalCost', 'TOTAL COST/VALUE', 7], ['remarks', 'REMARKS', 9],
];
export const stationMoney = value => value == null || value === '' ? '' : Number(value).toFixed(2);
const clean = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7e\n]/g, '?');
export const stationDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : '';

export async function buildStationPpePdf(record) {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(pdf);
  const title = bold;
  const width = 841.89, height = 595.28, margin = 28, tableWidth = width - 2 * margin;
  const edges = [margin];
  STATION_PPE_COLUMNS.forEach(([, , percent]) => edges.push(edges.at(-1) + tableWidth * percent / 100));
  const wrap = (value, available, font = regular, size = FORM_PDF_FONT_SIZE) => {
    const lines = [];
    for (const paragraph of clean(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > available) { lines.push(line); line = ''; }
        for (const character of `${line ? ' ' : ''}${word}`) {
          if (line && font.widthOfTextAtSize(line + character, size) > available) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let page, y;
  const text = (value, x, top, w, { font = regular, size = FORM_PDF_FONT_SIZE, align = 'center', boxHeight } = {}) => {
    const lines = wrap(value, w - 8, font, size);
    const offset = boxHeight ? Math.max(3, (boxHeight - lines.length * (size + 3)) / 2) : 3;
    lines.forEach((line, index) => page.drawText(line, { x: align === 'left' ? x + 4 : x + (w - font.widthOfTextAtSize(line, size)) / 2, y: top - offset - size - index * (size + 3), font, size, color: rgb(0, 0, 0) }));
  };
  const box = (x, top, w, h) => page.drawRectangle({ x, y: top - h, width: w, height: h, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  const line = (x, top, w) => page.drawLine({ start: { x, y: top }, end: { x: x + w, y: top }, thickness: .6 });
  const nextPage = (withTable = true) => {
    page = pdf.addPage([width, height]);
    if (!withTable) { y = height - margin; return; }
    text('Republic of the Philippines', margin, height - 36, tableWidth, { size: FORM_PDF_FONT_SIZE });
    text(record.governmentUnit || 'LOCAL GOVERNMENT UNIT OF CARIGARA', margin, height - 55, tableWidth, { size: FORM_PDF_FONT_SIZE, font: title });
    text('List of PPEs Found at Station', margin, height - 76, tableWidth, { size: FORM_PDF_FONT_SIZE });
    text(`PPE Account Group: ${record.accountGroup}`, margin, height - 109, tableWidth, { size: FORM_PDF_FONT_SIZE, align: 'left' });
    y = height - 135;
    STATION_PPE_COLUMNS.forEach(([, label], index) => { box(edges[index], y, edges[index + 1] - edges[index], 42); text(label, edges[index], y, edges[index + 1] - edges[index], { font: bold, size: FORM_PDF_FONT_SIZE, boxHeight: 42 }); });
    y -= 42;
  };
  nextPage();
  let accountableCell;
  const flushAccountable = () => {
    if (!accountableCell) return;
    box(edges[3], accountableCell.top, edges[4] - edges[3], accountableCell.height);
    text(accountableCell.value, edges[3], accountableCell.top, edges[4] - edges[3], { boxHeight: accountableCell.height });
    accountableCell = null;
  };
  for (const row of record.rows) {
    const values = STATION_PPE_COLUMNS.map(([key]) => ['unitCost', 'totalCost'].includes(key) ? stationMoney(row[key]) : row[key]);
    const rowHeight = Math.max(30, ...values.map((value, index) => wrap(value, edges[index + 1] - edges[index] - 8).length * (FORM_PDF_FONT_SIZE + 3) + 10));
    if (rowHeight > height - 215) throw new Error('A PPE description is too long for one page. Shorten it or split it into rows.');
    if (y - rowHeight < margin) { flushAccountable(); nextPage(); }
    if (accountableCell && (!values[3] || accountableCell.value !== values[3])) flushAccountable();
    if (accountableCell) accountableCell.height += rowHeight;
    else accountableCell = { value: values[3], top: y, height: rowHeight };
    values.forEach((value, index) => { if (index === 3) return; box(edges[index], y, edges[index + 1] - edges[index], rowHeight); text(value, edges[index], y, edges[index + 1] - edges[index], { boxHeight: rowHeight }); });
    y -= rowHeight;
  }
  flushAccountable();
  if (y - 112 < margin) nextPage(false);
  box(margin, y, tableWidth, 112);
  const leftWidth = tableWidth * .6, rightX = margin + leftWidth, rightWidth = tableWidth - leftWidth;
  text('Prepared by:', margin + 8, y - 7, leftWidth - 16, { align: 'left', size: FORM_PDF_FONT_SIZE });
  text('Reviewed by:', rightX + 8, y - 7, rightWidth - 16, { align: 'left', size: FORM_PDF_FONT_SIZE });
  text(record.preparedBy || '', margin + 70, y - 33, leftWidth - 100, { size: FORM_PDF_FONT_SIZE });
  line(margin + 70, y - 49, leftWidth - 100);
  text(record.preparedDesignation || '', margin + 70, y - 51, leftWidth - 100, { size: FORM_PDF_FONT_SIZE });
  text(record.reviewedBy || '', rightX + 30, y - 33, rightWidth - 60, { size: FORM_PDF_FONT_SIZE });
  line(rightX + 30, y - 49, rightWidth - 60);
  text(record.reviewedDesignation || '', rightX + 30, y - 51, rightWidth - 60, { size: FORM_PDF_FONT_SIZE });
  text('Date:', margin + 12, y - 78, 60, { size: FORM_PDF_FONT_SIZE, align: 'left' });
  text(stationDate(record.date), margin + 70, y - 77, leftWidth - 100, { size: FORM_PDF_FONT_SIZE });
  line(margin + 70, y - 95, leftWidth - 100);
  return pdf.save();
}
