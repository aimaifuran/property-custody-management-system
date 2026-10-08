import { PDFDocument, rgb } from 'pdf-lib';
import { embedFormFonts } from './formPdfFonts.js';
import { signatoryText } from './formPdfSignatories.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { drawReportGridHeader, drawReportGridRow, drawReportLines, reportColumns, REPORT_CELL_PADDING, REPORT_LINE_HEIGHT, wrapReportText } from './reportPdfLayout.js';

const green = rgb(.10, .38, .27), lightGreen = rgb(.91, .96, .93), ink = rgb(.12, .17, .15);
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

export async function buildReportsPdf({ annual, title, periodLabel, year, monthName, records, forms, selectedForm = 'ALL', onDraw }, loadLogo = async () => fetch('/lgu-logo.png').then(response => response.arrayBuffer())) {
  const pdf = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(pdf);
  const [width, height] = FORM_PDF_A4_PORTRAIT;
  const margin = FORM_PDF_MARGIN, usable = width - margin * 2;
  const layout = { page: null, y: 0, bottom: margin, rowCapacity: 0, onDraw };
  const paragraph = (value, x, top, w, font = regular, align = 'left', color = ink) => drawReportLines(layout.page, wrapReportText(value, w - 8, font), x, top, w, font, { align, color });
  if (annual) {
    const columns = reportColumns([
      ['type', 'Report', 17], ['documentNumber', 'Document number', 23],
      ['entityName', 'Entity / office', 27], ['reportDate', 'Date', 15], ['status', 'Status', 18],
    ], margin, usable);
    const nextPage = () => {
      layout.page = pdf.addPage(FORM_PDF_A4_PORTRAIT);
      layout.y = height - margin;
      layout.y -= paragraph('Property Accountability Management System', margin, layout.y, usable, bold, 'left', green) + 4;
      layout.y -= paragraph(`${title} - ${periodLabel}`, margin, layout.y, usable, bold) + 4;
      layout.y -= paragraph(`Issued reports recorded: ${records.length}`, margin, layout.y, usable) + 8;
      drawReportGridHeader(layout, columns, bold);
      layout.rowCapacity = layout.y - layout.bottom;
      if (layout.rowCapacity < 24) throw new Error('The report header is too long for A4. Shorten its header fields.');
    };
    nextPage();
    for (const record of records) {
      drawReportGridRow(layout, columns, [record.type, record.documentNumber || 'Unnumbered', record.entityName || '-', dateLabel(record.reportDate), record.status || 'RECORDED'], regular, nextPage);
    }
    return pdf.save();
  }

  layout.page = pdf.addPage(FORM_PDF_A4_PORTRAIT);
  const page = layout.page;
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(.98, .99, .98) });
  page.drawRectangle({ x: 0, y: height - 7, width, height: 7, color: green });
  page.drawRectangle({ x: 0, y: 0, width, height: 7, color: green });
  let logo;
  try { logo = await pdf.embedPng(await loadLogo()); } catch { /* A logo is optional. */ }
  const headerTop = height - margin;
  if (logo) page.drawImage(logo, { x: margin + 10, y: headerTop - 66, width: 58, height: 58 });
  const headerX = margin + 82, headerWidth = usable - 82;
  let top = headerTop;
  top -= paragraph('MUNICIPALITY OF CARIGARA', headerX, top, headerWidth, bold, 'center', green);
  top -= paragraph('SUPPLY OFFICE', headerX, top, headerWidth, bold, 'center', green);
  top -= paragraph('Safe and Efficient Supply Management for a Better Service', headerX, top, headerWidth, regular, 'center');
  layout.y = Math.min(top, headerTop - 72) - 8;
  page.drawLine({ start: { x: margin, y: layout.y }, end: { x: width - margin, y: layout.y }, thickness: 1.4, color: green });
  layout.y -= 8;
  layout.y -= paragraph('MONTHLY SUPPLY OFFICE REPORT', margin, layout.y, usable, bold, 'center', green);
  layout.y -= paragraph(`Month: ${monthName} ${year}    A.Y.: ${year} - ${Number(year) + 1}`, margin, layout.y, usable, bold, 'center') + 10;

  const section = (label, x, y, w) => {
    page.drawRectangle({ x, y: y - 20, width: w, height: 20, color: green });
    paragraph(label, x + 4, y, w - 8, bold, 'left', rgb(1, 1, 1));
  };
  const panel = (x, top, w, h, color = rgb(1, 1, 1)) => page.drawRectangle({ x, y: top - h, width: w, height: h, color, borderWidth: .6, borderColor: rgb(.78, .84, .80) });
  const countByType = types => records.filter(record => types.includes(record.type)).length;
  const summary = [
    ['Received', countByType(['IAR']), '(IAR)'], ['Issued', countByType(['RIS', 'ICS']), '(RIS / ICS)'],
    ['Returned', countByType(['PRS', 'RETURNED SUPPLY']), '(PRS)'], ['Transferred', countByType(['PTR']), '(PTR)'],
    ['Property records', countByType(['PROPERTY CARD', 'PAR']), '(PC / PAR)'],
  ];
  section('EXECUTIVE SUMMARY', margin, layout.y, usable);
  layout.y -= 26;
  const cardWidth = (usable - 4 * 7) / 5;
  const cardHeight = Math.max(...summary.map(([label, value, sublabel]) => [value, label, sublabel].reduce((sum, text) => sum + wrapReportText(text, cardWidth - 8, regular).length * REPORT_LINE_HEIGHT + 8, 0)));
  summary.forEach(([label, value, sublabel], index) => {
    const x = margin + index * (cardWidth + 7);
    panel(x, layout.y, cardWidth, cardHeight, lightGreen);
    let rowTop = layout.y;
    rowTop -= paragraph(value, x, rowTop, cardWidth, bold, 'center', green);
    rowTop -= paragraph(label, x, rowTop, cardWidth, regular, 'center');
    paragraph(sublabel, x, rowTop, cardWidth, regular, 'center');
  });
  layout.y -= cardHeight + 12;

  const gap = 18, half = (usable - gap) / 2, right = margin + half + gap;
  section('SUPPLY TRANSACTIONS', margin, layout.y, half);
  section('TRANSACTIONS OVERVIEW', right, layout.y, half);
  layout.y -= 24;
  const formRows = forms.filter(form => selectedForm === 'ALL' || form.value === selectedForm)
    .map(form => [form.label, records.filter(record => record.type === form.value).length]);
  const transactionColumns = reportColumns([['label', 'Form', 74, 'left'], ['count', 'Documents', 26, 'right']], margin, half);
  const transactionHeaderHeight = Math.max(...transactionColumns.map(column => wrapReportText(column.label, column.width - 2 * REPORT_CELL_PADDING, bold).length)) * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING;
  const rowHeights = formRows.map(values => Math.max(...values.map((value, index) => wrapReportText(value, transactionColumns[index].width - 2 * REPORT_CELL_PADDING, regular).length)) * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING);
  const transactionHeight = Math.max(140, transactionHeaderHeight + rowHeights.reduce((sum, h) => sum + h, 0));
  panel(margin, layout.y, half, transactionHeight);
  panel(margin, layout.y, half, transactionHeaderHeight, lightGreen);
  const transactionLayout = { ...layout, bottom: layout.y - transactionHeight, rowCapacity: transactionHeight };
  drawReportGridHeader(transactionLayout, transactionColumns, bold);
  for (const values of formRows) drawReportGridRow(transactionLayout, transactionColumns, values, regular, () => { throw new Error('The monthly transaction table is too long for A4.'); });
  panel(right, layout.y, half, transactionHeight);
  const chartWidth = half - 16, slot = chartWidth / 5, chartBottom = layout.y - transactionHeight + 44;
  const chartHeight = transactionHeight - 76, maximum = Math.max(...summary.map(([, value]) => value), 1);
  summary.forEach(([label, value], index) => {
    const x = right + 8 + index * slot, barWidth = Math.min(24, slot - 12);
    const h = value / maximum * chartHeight;
    page.drawRectangle({ x: x + (slot - barWidth) / 2, y: chartBottom, width: barWidth, height: Math.max(2, h), color: index % 2 ? rgb(.32, .57, .43) : rgb(.56, .73, .62) });
    paragraph(value, x, chartBottom + h + 21, slot, bold, 'center');
    paragraph(label === 'Transferred' ? 'Transfers' : label, x, chartBottom - 4, slot, regular, 'center');
  });
  layout.y -= transactionHeight + 12;

  const coverage = ['All monthly form records are listed above.', `Total form documents: ${records.length}`, 'The detailed records remain available in the on-screen report table for document review.'];
  const activities = ['Processed form records for the selected month.', `Recorded ${records.length} document${records.length === 1 ? '' : 's'} across the selected forms.`, 'Updated supply and property accountability records.'];
  section('FORM COVERAGE', margin, layout.y, half);
  section('NOTABLE ACTIVITIES', right, layout.y, half);
  layout.y -= 24;
  const informationHeight = Math.max(...[coverage, activities].map(values => values.reduce((sum, value) => sum + wrapReportText(value, half - 24, regular).length * REPORT_LINE_HEIGHT + 12, 8)));
  [coverage, activities].forEach((values, index) => {
    const x = index ? right : margin;
    panel(x, layout.y, half, informationHeight);
    let textTop = layout.y - 4;
    values.forEach(value => { textTop -= paragraph(value, x + 8, textTop, half - 16) + 4; });
  });
  layout.y -= informationHeight + 12;

  section('REMARKS', margin, layout.y, usable);
  layout.y -= 24;
  const remarks = 'The Supply Office continues to ensure the proper management of supplies and property records. All forms are organized for review and accountability.';
  const remarksHeight = wrapReportText(remarks, usable - 24, regular).length * REPORT_LINE_HEIGHT + 16;
  panel(margin, layout.y, usable, remarksHeight, lightGreen);
  paragraph(remarks, margin + 8, layout.y - 4, usable - 16);
  layout.y -= remarksHeight + 24;
  if (layout.y - 32 < margin) {
    layout.page = pdf.addPage(FORM_PDF_A4_PORTRAIT);
    layout.y = height - margin;
  }
  const signatureWidth = usable / 3;
  ['Prepared by:', 'Reviewed by:', 'Approved by:'].map(signatoryText).forEach((label, index) => {
    const x = margin + index * signatureWidth;
    layout.page.drawLine({ start: { x: x + 18, y: layout.y - 10 }, end: { x: x + signatureWidth - 18, y: layout.y - 10 }, thickness: .7, color: rgb(.38, .47, .42) });
    const lines = wrapReportText(label, signatureWidth - 8, regular);
    const bounds = { x, y: layout.y - 14 - (lines.length * REPORT_LINE_HEIGHT + 8), width: signatureWidth, height: lines.length * REPORT_LINE_HEIGHT + 8 };
    drawReportLines(layout.page, lines, x, layout.y - 14, signatureWidth, regular, {
      align: 'center', onDraw: text => onDraw?.({ kind: 'signature', ...text, bounds, value: label }),
    });
  });
  return pdf.save();
}
