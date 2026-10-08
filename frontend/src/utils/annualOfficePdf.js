import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { PDFDocument } from 'pdf-lib';
import { drawReportGridHeader, drawReportGridRow, drawReportLines, reportColumns, wrapReportText } from './reportPdfLayout.js';

export async function buildAnnualOfficePdf(group, year, { onDraw } = {}) {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(pdf);
  const [width, height] = FORM_PDF_A4_LANDSCAPE;
  const margin = FORM_PDF_MARGIN, tableWidth = width - margin * 2;
  const definitions = [
    ['office', 'Office', 17], ['description', 'Description', 24], ['quantity', 'Qty', 5],
    ['unit', 'Unit', 6], ['propertyNumber', 'Property / stock no.', 14],
    ['custodian', 'Custodian', 17], ['documentNumber', 'Document', 17],
  ];
  const columns = reportColumns(definitions, margin, tableWidth);
  const layout = { page: null, y: 0, bottom: margin, rowCapacity: 0, onDraw };
  const nextPage = () => {
    layout.page = pdf.addPage(FORM_PDF_A4_LANDSCAPE);
    layout.y = height - margin;
    for (const label of [`Annual Office Items - ${year}`, `${group.itemType || ''} | Total quantity: ${group.quantity ?? ''}`]) {
      layout.y -= drawReportLines(layout.page, wrapReportText(label, tableWidth - 8, bold), margin, layout.y, tableWidth, bold) + 4;
    }
    drawReportGridHeader(layout, columns, bold);
    layout.rowCapacity = layout.y - layout.bottom;
    if (layout.rowCapacity < 24) throw new Error('The report header is too long for A4. Shorten its header fields.');
  };
  nextPage();
  for (const row of group.rows || []) {
    const values = [row.office, row.description, row.quantity, row.unit, row.propertyNumber || row.stockNumber || '-', row.custodian || '-', row.documentNumber];
    drawReportGridRow(layout, columns, values, regular, nextPage);
  }
  return pdf.save();
}
