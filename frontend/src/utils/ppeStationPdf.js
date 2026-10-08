import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { signatoryText } from './formPdfSignatories.js';
import { PDFDocument, rgb } from 'pdf-lib';
import { drawReportGridHeader, drawReportGridRow, drawReportLines, reportColumns, REPORT_LINE_HEIGHT, wrapReportText } from './reportPdfLayout.js';

export const STATION_PPE_COLUMNS = [
  ['article', 'ARTICLE/ITEM', 11], ['description', 'DESCRIPTION', 32],
  ['propertyNumber', 'NEW PROPERTY NO. ASSIGNED', 15], ['accountablePerson', 'PERSON ACCOUNTABLE', 18],
  ['unitCost', 'UNIT COST / VALUE', 7], ['totalCost', 'TOTAL COST / VALUE', 7], ['remarks', 'REMARKS', 10],
];
export const stationMoney = value => value == null || value === '' ? '' : Number(value).toFixed(2);
export const stationDate = value => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() : '';

export async function buildStationPpePdf(record, { onDraw } = {}) {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(pdf);
  const [width, height] = FORM_PDF_A4_LANDSCAPE;
  const margin = FORM_PDF_MARGIN, tableWidth = width - 2 * margin;
  const columns = reportColumns(STATION_PPE_COLUMNS, margin, tableWidth);
  const layout = { page: null, y: 0, bottom: margin, rowCapacity: 0, onDraw };
  const paragraph = (value, x, top, w, font = regular, align = 'center') => drawReportLines(layout.page, wrapReportText(value, w - 8, font), x, top, w, font, { align });
  const nextPage = (withTable = true) => {
    layout.page = pdf.addPage(FORM_PDF_A4_LANDSCAPE);
    layout.y = height - margin;
    layout.y -= paragraph('Republic of the Philippines', margin, layout.y, tableWidth);
    layout.y -= paragraph(record.governmentUnit || 'LOCAL GOVERNMENT UNIT OF CARIGARA', margin, layout.y, tableWidth, bold);
    layout.y -= paragraph('List of PPEs Found at Station', margin, layout.y, tableWidth) + 8;
    layout.y -= paragraph(`PPE Account Group: ${record.accountGroup || ''}`, margin, layout.y, tableWidth, regular, 'left') + 8;
    if (withTable) drawReportGridHeader(layout, columns, bold);
    layout.rowCapacity = layout.y - layout.bottom;
    if (layout.rowCapacity < 30) throw new Error('The report header is too long for A4. Shorten its header fields.');
  };
  nextPage();
  for (const row of record.rows || []) {
    const values = STATION_PPE_COLUMNS.map(([key]) => ['unitCost', 'totalCost'].includes(key) ? stationMoney(row[key]) : row[key]);
    drawReportGridRow(layout, columns, values, regular, nextPage, 30);
  }
  const blocks = [
    { x: margin, width: tableWidth * .6, fields: [
      [signatoryText('Prepared by:'), regular, 18], [signatoryText(record.preparedBy) || '____________________________', bold, 0],
      [signatoryText(record.preparedDesignation), regular, 8], [`DATE: ${stationDate(record.date)}`, regular, 0],
    ] },
    { x: margin + tableWidth * .6, width: tableWidth * .4, fields: [
      [signatoryText('Reviewed by:'), regular, 18], [signatoryText(record.reviewedBy) || '____________________________', bold, 0],
      [signatoryText(record.reviewedDesignation), regular, 0],
    ] },
  ];
  const signatureHeight = Math.max(...blocks.map(block => block.fields.reduce((sum, [value, font, gap]) => sum + wrapReportText(value, block.width - 24, font).length * REPORT_LINE_HEIGHT + 8 + gap, 16)));
  if (layout.y - signatureHeight < margin) nextPage(false);
  if (layout.y - signatureHeight < margin) throw new Error('The signatory details are too long for A4. Shorten the signatory fields.');
  layout.page.drawRectangle({ x: margin, y: layout.y - signatureHeight, width: tableWidth, height: signatureHeight, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  for (const block of blocks) {
    let top = layout.y - 8;
    for (const [value, font, gap] of block.fields) {
      const lines = wrapReportText(value, block.width - 24, font);
      const fieldHeight = lines.length * REPORT_LINE_HEIGHT + 8;
      const bounds = { x: block.x + 8, y: top - fieldHeight, width: block.width - 16, height: fieldHeight };
      top -= drawReportLines(layout.page, lines, bounds.x, top, bounds.width, font, {
        align: 'center', onDraw: text => onDraw?.({ kind: 'signature', ...text, bounds, value }),
      }) + gap;
      if (font === bold) layout.page.drawLine({ start: { x: block.x + 20, y: top + 2 }, end: { x: block.x + block.width - 20, y: top + 2 }, thickness: .6 });
    }
  }
  return pdf.save();
}
