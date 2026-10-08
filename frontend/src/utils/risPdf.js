import { PDFDocument, rgb } from 'pdf-lib';
import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_FONT_SIZE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { signatoryText } from './formPdfSignatories.js';

const PAGE = FORM_PDF_A4_PORTRAIT;
const MARGIN = FORM_PDF_MARGIN;
const WIDTH = PAGE[0] - MARGIN * 2;
const asText = value => value == null ? '' : typeof value === 'object' ? value.name || '' : String(value);
const dateText = value => !value || Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toLocaleDateString('en-PH');

export async function buildRisPdf(data, { onDraw } = {}) {
  const document = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(document, ['regular', 'bold']);
  const size = FORM_PDF_FONT_SIZE, leading = 12, padding = 4;
  const items = Array.isArray(data.items) ? data.items : [];
  const valuesFor = item => [item.stockNumber ?? item.stock_number ?? '', item.unit, item.description ?? item.item, item.quantityRequested, item.isAvailable == null ? '' : item.isAvailable ? '/' : '', item.isAvailable === false ? '/' : '', Number(item.quantityIssued) > 0 ? item.quantityIssued : '', item.remarks];
  const measuredWidth = (index, minimum, maximum) => Math.min(maximum, Math.max(minimum, ...items.map(item => regular.widthOfTextAtSize(asText(valuesFor(item)[index]), size) + padding * 2)));
  const stockWidth = measuredWidth(0, 48, 95), unitWidth = measuredWidth(1, 34, 50);
  const requestedWidth = measuredWidth(3, 49, 65), issuedWidth = measuredWidth(6, 57, 65);
  const proseWidth = WIDTH - stockWidth - unitWidth - requestedWidth - issuedWidth - 54;
  const descriptionWidth = Math.max(140, proseWidth * .66);
  const COLUMNS = [stockWidth, unitWidth, descriptionWidth, requestedWidth, 27, 27, issuedWidth, proseWidth - descriptionWidth];
  const wrap = (value, width, font = regular) => {
    const lines = [];
    for (const paragraph of asText(value).split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = ''; }
        for (const [partIndex, part] of (word.match(/[^/_-]+[/_-]?|[/_-]/g) || [word]).entries()) {
          let separator = partIndex === 0 && line ? ' ' : '';
          if (line && font.widthOfTextAtSize(line + separator + part, size) > width) { lines.push(line); line = ''; separator = ''; }
          for (const character of `${separator}${part}`) {
            if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
            line += character;
          }
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let page;
  const box = (x, top, width, height) => page.drawRectangle({ x, y: top - height, width, height, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  const draw = (value, x, top, width, height, { font = regular, align = 'left', section = '', fieldRole, lines = wrap(value, width - 8, font) } = {}) => {
    const ascent = font.heightAtSize(size, { descender: false });
    const textHeight = font.heightAtSize(size), descent = textHeight - ascent;
    const blockHeight = textHeight + (lines.length - 1) * leading;
    const first = top - (height - blockHeight) / 2 - ascent;
    lines.forEach((line, index) => {
      if (!line) return;
      const textWidth = font.widthOfTextAtSize(line, size);
      const left = align === 'center' ? x + (width - textWidth) / 2 : align === 'right' ? x + width - textWidth - 4 : x + 4;
      const y = first - index * leading;
      page.drawText(line, { x: left, y, size, font });
      onDraw?.({ text: line, x: left, y, width: textWidth, size, ascent, descent, padding, page: document.getPageCount(), section, fieldRole, bounds: { x, top, width, height } });
    });
  };
  const fieldHeight = (label, value, width) => Math.max(22, wrap(value, width - bold.widthOfTextAtSize(label, size) - 20).length * leading + 8);
  const field = (label, value, x, top, width, height) => {
    const labelWidth = bold.widthOfTextAtSize(label, size) + 12;
    draw(label, x, top, labelWidth, height, { font: bold });
    draw(value, x + labelWidth, top, width - labelWidth, height);
  };
  const personSections = ['requestedBy', 'approvedBy', 'issuedBy', 'receivedBy'];
  const signatureLabelWidth = 80;
  const personWidth = (WIDTH - signatureLabelWidth) / 4;
  const people = personSections.map(key => data[key] || {});
  const names = people.map(signatoryText);
  const designations = people.map(person => signatoryText(person.designation || person.position));
  const dates = people.map(person => dateText(person.date));
  const nameHeight = Math.max(22, ...names.map(value => wrap(value, personWidth - 8).length * leading + 8));
  const designationHeight = Math.max(22, ...designations.map(value => wrap(value, personWidth - 8).length * leading + 8));
  const purposeHeight = Math.max(34, fieldHeight('Purpose:', data.purpose, WIDTH));
  const footerHeight = purposeHeight + 22 + 28 + nameHeight + designationHeight + 22;
  const rowBottom = MARGIN + footerHeight;
  const edges = [MARGIN]; COLUMNS.forEach(width => edges.push(edges.at(-1) + width));
  const newPage = () => {
    page = document.addPage(PAGE);
    const headingTop = PAGE[1] - MARGIN;
    draw('Appendix 63', MARGIN, headingTop, WIDTH, 18, { align: 'right' });
    draw('REQUISITION AND ISSUE SLIP', MARGIN, headingTop - 24, WIDTH, 24, { font: bold, align: 'center' });
    let top = headingTop - 60;
    const agencyWidth = WIDTH * .59;
    const agencyHeight = Math.max(fieldHeight('Entity Name:', data.entityName, agencyWidth), fieldHeight('Fund Cluster:', data.fundCluster, WIDTH - agencyWidth));
    field('Entity Name:', data.entityName, MARGIN, top, agencyWidth, agencyHeight);
    field('Fund Cluster:', data.fundCluster, MARGIN + agencyWidth, top, WIDTH - agencyWidth, agencyHeight);
    top -= agencyHeight + 4;
    const half = WIDTH / 2;
    for (const [leftLabel, leftValue, rightLabel, rightValue] of [['Division:', data.division, 'Responsibility Center Code:', data.responsibilityCenterCode], ['Office:', data.office, 'RIS No.:', data.risNumber]]) {
      const height = Math.max(fieldHeight(leftLabel, leftValue, half), fieldHeight(rightLabel, rightValue, half));
      box(MARGIN, top, half, height); box(MARGIN + half, top, half, height);
      field(leftLabel, leftValue, MARGIN, top, half, height); field(rightLabel, rightValue, MARGIN + half, top, half, height);
      top -= height;
    }
    const groups = [['Requisition', 0, 4], ['Stock Available?', 4, 6], ['Issue', 6, 8]];
    const groupHeight = Math.max(24, ...groups.map(([label, start, end]) => wrap(label, edges[end] - edges[start] - 8, bold).length * leading + 8));
    for (const [label, start, end] of groups) {
      box(edges[start], top, edges[end] - edges[start], groupHeight);
      draw(label, edges[start], top, edges[end] - edges[start], groupHeight, { font: bold, align: 'center' });
    }
    top -= groupHeight;
    const labels = ['Stock No.', 'Unit', 'Description', 'Quantity', 'Yes', 'No', 'Quantity', 'Remarks'];
    const headerHeight = Math.max(22, ...labels.map((label, index) => wrap(label, COLUMNS[index] - 8).length * leading + 8));
    labels.forEach((label, index) => {
      box(edges[index], top, COLUMNS[index], headerHeight); draw(label, edges[index], top, COLUMNS[index], headerHeight, { align: 'center' });
    });
    return top - headerHeight;
  };
  const drawRow = (values, top, height, wrapped = false) => {
    values.forEach((value, index) => {
      box(edges[index], top, COLUMNS[index], height);
      draw(value, edges[index], top, COLUMNS[index], height, { align: [2, 7].includes(index) ? 'left' : 'center', section: `item:${index}`, ...(wrapped ? { lines: value } : {}) });
    });
  };
  const footer = top => {
    box(MARGIN, top, WIDTH, purposeHeight);
    field('Purpose:', data.purpose, MARGIN, top, WIDTH, purposeHeight);
    top -= purposeHeight;
    for (const [label, values, height, headings, section] of [['', ['REQUESTED BY:', 'APPROVED BY:', 'ISSUED BY:', 'RECEIVED BY:'], 22, true, 'signatory:heading'], ['SIGNATURE:', ['', '', '', ''], 28, false, 'signatory:signature'], ['PRINTED NAME:', names, nameHeight, false, 'signatory:name'], ['DESIGNATION:', designations, designationHeight, false, 'signatory:designation'], ['DATE:', dates, 22, false, 'signatory:date']]) {
      box(MARGIN, top, signatureLabelWidth, height); draw(label, MARGIN, top, signatureLabelWidth, height, { align: 'center', section, fieldRole: 'label' });
      values.forEach((value, index) => { const x = MARGIN + signatureLabelWidth + index * personWidth; box(x, top, personWidth, height); draw(value, x, top, personWidth, height, { font: headings ? bold : regular, align: 'center', section, fieldRole: 'value' }); });
      top -= height;
    }
  };
  let top = newPage(), rows = 0;
  if (top - 22 < rowBottom) throw new Error('The RIS header or signatories are too long for one page. Shorten those entries.');
  const maximumRowHeight = top - rowBottom;
  for (const item of items) {
    const columns = valuesFor(item).map((value, index) => wrap(value, COLUMNS[index] - 8));
    const lineCount = Math.max(...columns.map(lines => lines.length));
    const fullHeight = Math.max(22, lineCount * leading + 8);
    if ((rows === 19 || top - fullHeight < rowBottom) && fullHeight <= maximumRowHeight) { footer(top); top = newPage(); rows = 0; }
    let offset = 0;
    while (offset < lineCount) {
      if (rows === 19 || top - 22 < rowBottom) { footer(top); top = newPage(); rows = 0; }
      const capacity = Math.floor((top - rowBottom - 8) / leading);
      if (capacity < 1) throw new Error('The RIS header or signatories are too long for one page. Shorten those entries.');
      const count = Math.min(lineCount - offset, capacity);
      const height = Math.max(22, count * leading + 8);
      drawRow(columns.map(lines => lines.slice(offset, offset + count)), top, height, true);
      top -= height; rows++; offset += count;
    }
  }
  while (rows < 19 && top - 22 >= rowBottom) { drawRow(Array(8).fill(''), top, 22); top -= 22; rows++; }
  footer(top);
  return document.save();
}
