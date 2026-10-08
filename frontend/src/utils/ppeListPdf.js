import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { signatoryText } from './formPdfSignatories.js';
import { PDFDocument, rgb } from 'pdf-lib';
import { drawReportGridHeader, drawReportGridRow, drawReportLines, reportColumns, REPORT_CELL_PADDING, REPORT_LINE_HEIGHT, wrapReportText } from './reportPdfLayout.js';

export const PPE_COLUMNS = [
  ['risNumber', 'RIS No.', 13], ['responsibilityCenter', 'Responsibility Center Code', 15],
  ['stockNumber', 'Stock No.', 7], ['item', 'Item', 26], ['unit', 'Unit', 8],
  ['quantity', 'Quantity Issued', 9], ['unitCost', 'Unit Cost', 10], ['amount', 'Amount', 12],
];
const RECAP_COLUMNS = [
  ['stockNumber', 'Stock No.', 12], ['item', 'Item', 34], ['unit', 'Unit', 8],
  ['quantity', 'Quantity', 8], ['unitCost', 'Unit Cost', 10],
  ['totalCost', 'Total Cost', 15], ['accountCode', 'Account Code', 13],
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

export async function buildPpePdf(record, { onDraw } = {}) {
  const pdf = await PDFDocument.create();
  const { regular, bold, italic } = await embedFormFonts(pdf);
  const [width, height] = FORM_PDF_A4_PORTRAIT;
  const left = FORM_PDF_MARGIN, tableWidth = width - 2 * left;
  const columns = reportColumns(PPE_COLUMNS, left, tableWidth);
  const recapColumns = reportColumns(RECAP_COLUMNS, left, tableWidth);
  const layout = { page: null, y: 0, bottom: left, rowCapacity: 0, onDraw };
  let recapping = false;
  const paragraph = (value, x, top, w, font = regular, align = 'center') => drawReportLines(layout.page, wrapReportText(value, w - 8, font), x, top, w, font, { align });
  const header = (withTable = true) => {
    layout.page = pdf.addPage(FORM_PDF_A4_PORTRAIT);
    layout.y = height - left;
    layout.y -= paragraph(PPE_TITLE, left, layout.y, tableWidth, bold);
    layout.y -= paragraph(ppePeriod(record), left, layout.y, tableWidth) + 10;
    for (const values of [[`LGU: ${record.lgu || ''}`, `Serial No.: ${record.serialNumber || ''}`], [`Fund: ${record.fund || ''}`, `Date: ${ppeDate(record.reportDate)}`]]) {
      const first = paragraph(values[0], left, layout.y, tableWidth * .6, regular, 'left');
      const second = paragraph(values[1], left + tableWidth * .6, layout.y, tableWidth * .4, regular, 'left');
      layout.y -= Math.max(first, second);
    }
    layout.y -= 8;
    if (withTable && recapping) {
      layout.y -= paragraph('Recapitulation', left, layout.y, tableWidth, bold);
      drawReportGridHeader(layout, recapColumns, bold);
    } else if (withTable) {
      const supplyWidth = columns[6].x - left;
      const accountingWidth = tableWidth - supplyWidth;
      const captions = ['To be filled up by the Supply and/or Property Division/Unit', 'To be filled up by the Accounting Division/Unit'];
      const cellLines = [wrapReportText(captions[0], supplyWidth - 2 * REPORT_CELL_PADDING, italic), wrapReportText(captions[1], accountingWidth - 2 * REPORT_CELL_PADDING, italic)];
      const h = Math.max(...cellLines.map(lines => lines.length)) * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING;
      [supplyWidth, accountingWidth].forEach((w, index) => {
        const x = index ? left + supplyWidth : left;
        layout.page.drawRectangle({ x, y: layout.y - h, width: w, height: h, borderWidth: .65, borderColor: rgb(0, 0, 0) });
        drawReportLines(layout.page, cellLines[index], x, layout.y, w, italic, { align: 'center', padding: REPORT_CELL_PADDING, height: h, verticalAlign: 'center' });
      });
      layout.y -= h;
      drawReportGridHeader(layout, columns, bold);
    }
    layout.rowCapacity = layout.y - layout.bottom;
    if (layout.rowCapacity < 32) throw new Error('The report header is too long for A4. Shorten its header fields.');
  };
  header();
  const money = value => value === '' || value == null ? '' : Number(value).toFixed(2);
  for (const row of record.rows || []) {
    const values = PPE_COLUMNS.map(([key]) => key === 'amount' ? ppeAmount(row) : key === 'unitCost' ? money(row.unitCost) : row[key]);
    drawReportGridRow(layout, columns, values, regular, header);
  }
  if (record.recapitulation?.length) {
    drawReportGridRow(layout, columns, ['', '', '', '', '', 'TOTAL', '', ppeTotal(record.rows || [])], bold, header);
    recapping = true;
    const captionHeight = 20;
    const recapHeaderHeight = Math.max(...recapColumns.map(column => wrapReportText(column.label, column.width - 2 * REPORT_CELL_PADDING, bold).length)) * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING;
    if (layout.y - captionHeight - recapHeaderHeight - 32 < left) header();
    else {
      layout.y -= paragraph('Recapitulation', left, layout.y, tableWidth, bold);
      drawReportGridHeader(layout, recapColumns, bold);
      // New-page capacity is measured by header() when another page is needed.
      layout.rowCapacity = layout.y - layout.bottom;
    }
    for (const row of record.recapitulation) {
      const values = RECAP_COLUMNS.map(([key]) => ['unitCost', 'totalCost'].includes(key) ? money(row[key]) : row[key]);
      drawReportGridRow(layout, recapColumns, values, regular, header);
    }
  }
  const blocks = [
    { x: left, width: tableWidth * .6, fields: [
      [signatoryText('I hereby certify to the correctness of the above information.'), regular, 14],
      [signatoryText(record.custodian) || '_________________________', bold, 4],
      [signatoryText('Signature over Printed Name of Supply\nand/or Property Custodian'), regular, 0],
    ] },
    { x: left + tableWidth * .6, width: tableWidth * .4, fields: [
      [signatoryText('Posted by:'), regular, 14],
      [signatoryText(record.accountingStaff) || '_____________________', bold, 4],
      [signatoryText('Signature over Printed Name of\nDesignated Accounting Staff'), regular, 4],
      [`DATE: ${ppeDate(record.postedDate) || '________________'}`, regular, 0],
    ] },
  ];
  const signatureHeight = Math.max(...blocks.map(block => block.fields.reduce((sum, [value, font, gap]) => sum + wrapReportText(value, block.width - 16, font).length * REPORT_LINE_HEIGHT + 8 + gap, 16)));
  if (layout.y - signatureHeight < left) header(false);
  if (layout.y - signatureHeight < left) throw new Error('The signatory details are too long for A4. Shorten the signatory fields.');
  for (const block of blocks) {
    layout.page.drawRectangle({ x: block.x, y: layout.y - signatureHeight, width: block.width, height: signatureHeight, borderWidth: .65, borderColor: rgb(0, 0, 0) });
    let top = layout.y - 8;
    for (const [value, font, gap] of block.fields) {
      const lines = wrapReportText(value, block.width - 16, font);
      const fieldHeight = lines.length * REPORT_LINE_HEIGHT + 8;
      const bounds = { x: block.x + 4, y: top - fieldHeight, width: block.width - 8, height: fieldHeight };
      top -= drawReportLines(layout.page, lines, bounds.x, top, bounds.width, font, {
        align: 'center', onDraw: text => onDraw?.({ kind: 'signature', ...text, bounds, value }),
      }) + gap;
    }
  }
  return pdf.save();
}
