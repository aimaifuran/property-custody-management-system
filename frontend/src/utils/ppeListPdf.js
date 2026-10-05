import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const PPE_COLUMNS = [
  ['risNumber', 'RIS No.', 9],
  ['responsibilityCenter', 'Responsibility Center Code', 9],
  ['stockNumber', 'Stock No.', 7],
  ['item', 'Item', 36],
  ['unit', 'Unit', 6],
  ['quantity', 'Quantity Issued', 8],
  ['unitCost', 'Unit Cost', 10],
  ['amount', 'Amount', 15],
];
export const PPE_TITLE = 'REPORT OF SUPPLIES AND MATERIALS ISSUED';
export const ppeAmount = row => row.unitCost === '' || row.unitCost == null ? '' : (Number(row.quantity) * Number(row.unitCost)).toFixed(2);
export const ppeTotal = rows => rows.some(row => row.unitCost !== '' && row.unitCost != null) ? rows.reduce((sum, row) => sum + Number(ppeAmount(row) || 0), 0).toFixed(2) : '';
export const ppeDate = value => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
export const ppePeriod = record => {
  if (record.periodStart?.slice(0, 7) === record.periodEnd?.slice(0, 7) && record.periodStart && record.periodEnd) {
    const start = new Date(`${record.periodStart}T00:00:00`);
    return `For the Period ${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}-${Number(record.periodEnd.slice(-2))}, ${start.getFullYear()}`;
  }
  return `For the Period ${ppeDate(record.periodStart)} - ${ppeDate(record.periodEnd)}`;
};
const printable = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/[^\x20-\x7e\n]/g, '?');

// Legal portrait matches the tall, eight-column report supplied as a reference.
export async function buildPpePdf(record) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const width = 612, height = 1008, left = 30, tableWidth = 552;
  const edges = [left];
  PPE_COLUMNS.forEach(([, , percentage]) => edges.push(edges.at(-1) + tableWidth * percentage / 100));
  let page, y;
  const wrap = (value, available, font = regular, size = 7) => {
    const lines = [];
    for (const paragraph of printable(value).split('\n')) {
      let line = '';
      for (const character of paragraph) {
        if (line && font.widthOfTextAtSize(line + character, size) > available) { lines.push(line); line = ''; }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  };
  const text = (value, x, top, available, options = {}) => {
    const { size = 7, font = regular, align = 'center' } = options;
    const lines = wrap(value, available - 6, font, size);
    lines.forEach((line, index) => page.drawText(line, { x: align === 'left' ? x + 3 : x + (available - font.widthOfTextAtSize(line, size)) / 2, y: top - size - 3 - index * (size + 2), size, font, color: rgb(0, 0, 0) }));
    return lines.length;
  };
  const box = (x, top, w, h) => page.drawRectangle({ x, y: top - h, width: w, height: h, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  const newPage = (includeHeader = true) => {
    page = pdf.addPage([width, height]);
    if (!includeHeader) { y = height - 30; return; }
    text(PPE_TITLE, left, height - 54, tableWidth, { size: 10, font: bold });
    text(ppePeriod(record), left, height - 72, tableWidth, { size: 8 });
    text(`LGU: ${record.lgu}`, left, height - 105, tableWidth * .6, { align: 'left', size: 8 });
    text(`Fund: ${record.fund || ''}`, left, height - 122, tableWidth * .6, { align: 'left', size: 8 });
    text(`Serial No.: ${record.serialNumber}`, left + tableWidth * .6, height - 105, tableWidth * .4, { align: 'left', size: 8 });
    text(`Date: ${ppeDate(record.reportDate)}`, left + tableWidth * .6, height - 122, tableWidth * .4, { align: 'left', size: 8 });
    y = height - 148;
    const supplyWidth = edges[6] - left;
    box(left, y, supplyWidth, 20);
    box(edges[6], y, edges[8] - edges[6], 20);
    text('To be filled up by the Supply and/or Property Division/Unit', left, y, supplyWidth, { font: italic });
    text('To be filled up by the Accounting Division/Unit', edges[6], y, edges[8] - edges[6], { size: 6, font: italic });
    y -= 20;
    PPE_COLUMNS.forEach(([, label], index) => { box(edges[index], y, edges[index + 1] - edges[index], 30); text(label, edges[index], y, edges[index + 1] - edges[index], { font: bold }); });
    y -= 30;
  };
  newPage();
  const drawRow = values => {
    const sizes = values.map((value, index) => record.referenceLayout && index === 3 ? Math.max(4, Math.min(7, (edges[index + 1] - edges[index] - 6) / Math.max(1, regular.widthOfTextAtSize(printable(value), 1)))) : 7);
    const rowHeight = Math.max(14, ...values.map((value, index) => wrap(value, edges[index + 1] - edges[index] - 6, regular, sizes[index]).length * (sizes[index] + 2) + 5));
    if (rowHeight > height - 248) throw new Error('An item is too long to fit on a printed page. Shorten its description.');
    if (y - rowHeight < 48) newPage(!record.referenceLayout);
    values.forEach((value, index) => { box(edges[index], y, edges[index + 1] - edges[index], rowHeight); text(value, edges[index], y, edges[index + 1] - edges[index], { size: sizes[index] }); });
    y -= rowHeight;
  };
  for (const [index, row] of record.rows.entries()) {
    if (record.referenceLayout && index === 52) newPage(false);
    const values = PPE_COLUMNS.map(([key]) => key === 'amount' ? ppeAmount(row) : key === 'unitCost' ? (row.unitCost === '' || row.unitCost == null ? '' : Number(row.unitCost).toFixed(2)) : row[key]);
    drawRow(values);
  }
  if (record.recapitulation?.length) {
    drawRow(['', '', '', '', '', 'TOTAL', '', ppeTotal(record.rows)]);
    if (y < 108) newPage(!record.referenceLayout);
    box(left, y, edges[3] - left, 18);
    box(edges[3], y, edges[5] - edges[3], 18);
    box(edges[5], y, edges[8] - edges[5], 18);
    text('Recapitulation:', left, y, edges[3] - left, { font: bold });
    text('Recapitulation:', edges[5], y, edges[8] - edges[5], { font: bold });
    y -= 18;
    drawRow(['', 'Stock No.', 'Quantity', '', '', 'Unit Cost', 'Total Cost', 'Account Code']);
    for (const [index, row] of record.recapitulation.entries()) {
      if (record.referenceLayout && index === 11) newPage(false);
      const money = value => value === '' || value == null ? '' : Number(value).toFixed(2);
      drawRow(['', row.stockNumber || '', row.quantity, row.item, row.unit, money(row.unitCost), money(row.totalCost), row.accountCode || '']);
    }
  }
  if (y < 154) newPage(!record.referenceLayout);
  box(left, y, edges[6] - left, 102);
  box(edges[6], y, edges[8] - edges[6], 102);
  text('I hereby certify to the correctness of the above information.', left + 4, y - 8, edges[6] - left - 8, { align: 'left', size: 8 });
  text(record.custodian || '_________________________', left, y - 33, edges[6] - left, { font: bold, size: 8 });
  text('Signature over Printed Name of Supply', left, y - 51, edges[6] - left, { size: 8 });
  text('and/or Property Custodian', left, y - 68, edges[6] - left, { size: 8 });
  text('Posted by:', edges[6], y - 5, edges[8] - edges[6], { align: 'left', size: 8 });
  const staffWidth = (edges[8] - edges[6]) * .7;
  text(record.accountingStaff || '_____________________', edges[6], y - 37, staffWidth, { size: 7 });
  text(ppeDate(record.postedDate) || '_________', edges[6] + staffWidth, y - 37, edges[8] - edges[6] - staffWidth, { size: 6 });
  text('Signature over Printed Name of', edges[6], y - 55, staffWidth, { size: 7 });
  text('Designated Accounting Staff', edges[6], y - 77, staffWidth, { size: 7 });
  text('Date', edges[6] + staffWidth, y - 67, edges[8] - edges[6] - staffWidth, { size: 7 });
  pdf.getPages().forEach((sheet, index) => sheet.drawText(`Page ${index + 1} of ${pdf.getPageCount()}`, { x: width - 83, y: 22, size: 7, font: regular }));
  return pdf.save();
}
