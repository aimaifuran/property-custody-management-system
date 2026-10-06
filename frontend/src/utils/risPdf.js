import { PDFDocument, rgb } from 'pdf-lib';
import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';

const PAGE = [595.32, 841.92];
const MARGIN = 42;
const WIDTH = PAGE[0] - MARGIN * 2;
const COLUMNS = [45, 32, 144, 48, 36, 36, 58, WIDTH - 399];
const asText = value => value == null ? '' : typeof value === 'object' ? value.name || '' : String(value);
const dateText = value => !value || Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toLocaleDateString('en-PH');

export async function buildRisPdf(data, { onDraw } = {}) {
  const document = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(document, ['regular', 'bold']);
  const size = FORM_PDF_FONT_SIZE, leading = 11;
  const wrap = (value, width, font = regular) => {
    const lines = [];
    for (const paragraph of asText(value).split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = ''; }
        for (const character of `${line ? ' ' : ''}${word}`) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let page;
  const box = (x, top, width, height) => page.drawRectangle({ x, y: top - height, width, height, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  const draw = (value, x, top, width, height, { font = regular, align = 'left' } = {}) => {
    const lines = wrap(value, width - 8, font);
    const first = top - Math.max(3, (height - lines.length * leading) / 2) - size;
    lines.forEach((line, index) => {
      if (!line) return;
      const textWidth = font.widthOfTextAtSize(line, size);
      const left = align === 'center' ? x + (width - textWidth) / 2 : x + 4;
      const y = first - index * leading;
      page.drawText(line, { x: left, y, size, font });
      onDraw?.({ text: line, x: left, y, width: textWidth, size, bounds: { x, top, width, height } });
    });
  };
  const fieldHeight = (label, value, width) => Math.max(22, wrap(value, width - regular.widthOfTextAtSize(label, size) - 18).length * leading + 8);
  const field = (label, value, x, top, width, height) => {
    const labelWidth = bold.widthOfTextAtSize(label, size) + 12;
    draw(label, x, top, labelWidth, height, { font: bold });
    draw(value, x + labelWidth, top, width - labelWidth, height);
  };
  const personSections = ['requestedBy', 'approvedBy', 'issuedBy', 'receivedBy'];
  const personWidth = (WIDTH - 70) / 4;
  const people = personSections.map(key => data[key] || {});
  const names = people.map(person => asText(person));
  const designations = people.map(person => person.designation || person.position || '');
  const dates = people.map(person => dateText(person.date));
  const nameHeight = Math.max(22, ...names.map(value => wrap(value, personWidth - 8).length * leading + 8));
  const designationHeight = Math.max(22, ...designations.map(value => wrap(value, personWidth - 8).length * leading + 8));
  const purposeHeight = Math.max(34, wrap(data.purpose, WIDTH - 52).length * leading + 8);
  const footerHeight = purposeHeight + 22 + 24 + nameHeight + designationHeight + 22;
  const rowBottom = 42 + footerHeight;
  const edges = [MARGIN]; COLUMNS.forEach(width => edges.push(edges.at(-1) + width));
  const newPage = () => {
    page = document.addPage(PAGE);
    draw('Appendix 63', PAGE[0] - 112, 818, 70, 18, { align: 'center' });
    draw('REQUISITION AND ISSUE SLIP', MARGIN, 793, WIDTH, 24, { font: bold, align: 'center' });
    let top = 758;
    const agencyWidth = 300;
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
    for (const [label, start, end] of [['Requisition', 0, 4], ['Stock Available?', 4, 6], ['Issue', 6, 8]]) {
      box(edges[start], top, edges[end] - edges[start], 30);
      draw(label, edges[start], top, edges[end] - edges[start], 30, { font: bold, align: 'center' });
    }
    top -= 30;
    ['Stock No.', 'Unit', 'Description', 'Quantity', 'Yes', 'No', 'Quantity', 'Remarks'].forEach((label, index) => {
      box(edges[index], top, COLUMNS[index], 22); draw(label, edges[index], top, COLUMNS[index], 22, { align: 'center' });
    });
    return top - 22;
  };
  const valuesFor = item => [item.stockNumber ?? item.stock_number ?? '', item.unit, item.description ?? item.item, item.quantityRequested, item.isAvailable == null ? '' : item.isAvailable ? '/' : '', item.isAvailable === false ? '/' : '', Number(item.quantityIssued) > 0 ? item.quantityIssued : '', item.remarks];
  const drawRow = (values, top, height) => {
    values.forEach((value, index) => {
      box(edges[index], top, COLUMNS[index], height);
      draw(value, edges[index], top, COLUMNS[index], height, { align: [2, 7].includes(index) ? 'left' : 'center' });
    });
  };
  const footer = top => {
    box(MARGIN, top, WIDTH, purposeHeight);
    field('Purpose:', data.purpose, MARGIN, top, WIDTH, purposeHeight);
    top -= purposeHeight;
    for (const [label, values, height, headings] of [['', ['Requested by:', 'Approved by:', 'Issued by:', 'Received by:'], 22, true], ['Signature:', ['', '', '', ''], 24], ['Printed Name:', names, nameHeight], ['Designation:', designations, designationHeight], ['Date:', dates, 22]]) {
      box(MARGIN, top, 70, height); draw(label, MARGIN, top, 70, height);
      values.forEach((value, index) => { const x = MARGIN + 70 + index * personWidth; box(x, top, personWidth, height); draw(value, x, top, personWidth, height, { font: headings ? bold : regular, align: 'center' }); });
      top -= height;
    }
  };
  let top = newPage(), rows = 0;
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const values = valuesFor(item);
    const height = Math.max(20, ...values.map((value, index) => wrap(value, COLUMNS[index] - 8).length * leading + 8));
    if (rows === 19 || top - height < rowBottom) { footer(top); top = newPage(); rows = 0; }
    if (top - height < rowBottom) throw new Error('This RIS item is too long for one page. Split its description into shorter rows.');
    drawRow(values, top, height); top -= height; rows++;
  }
  while (rows < 19 && top - 20 >= rowBottom) { drawRow(Array(8).fill(''), top, 20); top -= 20; rows++; }
  footer(top);
  return document.save();
}
