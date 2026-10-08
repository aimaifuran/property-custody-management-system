import { PDFDocument, rgb } from 'pdf-lib';
import { embedFormFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_FONT_SIZE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { signatoryText } from './formPdfSignatories.js';

const PAGE = FORM_PDF_A4_PORTRAIT;
const MARGIN = FORM_PDF_MARGIN;
const WIDTH = PAGE[0] - MARGIN * 2;
const text = value => value == null ? '' : typeof value === 'object' ? value.name || '' : String(value);
const dateText = value => !value || Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
const amountText = value => value == null || value === '' ? '' : Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The original template's captions use font-dependent tab offsets. Explicit
// measured cells keep the same official sections readable at the shared size.
export async function buildPtrPdf(data = {}, { onDraw } = {}) {
  const document = await PDFDocument.create();
  const { regular, bold } = await embedFormFonts(document, ['regular', 'bold']);
  const size = FORM_PDF_FONT_SIZE;
  const leading = 12, padding = 5;
  const items = Array.isArray(data.items) ? data.items : [];
  const measuredWidth = (valueFor, minimum, maximum) => Math.min(maximum, Math.max(minimum, ...items.map(item => regular.widthOfTextAtSize(text(valueFor(item)), size) + padding * 2)));
  const dateWidth = 60, propertyWidth = measuredWidth(item => item.propertyNumber, 90, 140);
  const amountWidth = measuredWidth(item => amountText(item.amount), 80, 105), conditionWidth = 85;
  const COLUMNS = [dateWidth, propertyWidth, WIDTH - dateWidth - propertyWidth - amountWidth - conditionWidth, amountWidth, conditionWidth];
  const wrap = (value, width, font = regular) => {
    const lines = [];
    for (const paragraph of text(value).split(/\r?\n/)) {
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
  const heightFor = (value, width, font = regular) => Math.max(22, wrap(value, width - 10, font).length * leading + 10);
  let page;
  const box = (x, top, width, height) => page.drawRectangle({ x, y: top - height, width, height, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  const draw = (value, x, top, width, height, { font = regular, align = 'left', section = '', fieldRole, underlined = false, lines = wrap(value, width - 10, font) } = {}) => {
    const ascent = font.heightAtSize(size, { descender: false });
    const textHeight = font.heightAtSize(size), descent = textHeight - ascent;
    const blockHeight = textHeight + (lines.length - 1) * leading;
    const first = top - (height - blockHeight) / 2 - ascent;
    lines.forEach((line, index) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      const left = align === 'center' ? x + (width - textWidth) / 2 : align === 'right' ? x + width - textWidth - 5 : x + 5;
      const y = first - index * leading;
      const underline = underlined ? { start: { x: x + padding, y: y - descent - 1 }, end: { x: x + width - padding, y: y - descent - 1 } } : undefined;
      if (underline) page.drawLine({ ...underline, thickness: .65 });
      if (!line) return;
      page.drawText(line, { x: left, y, size, font });
      onDraw?.({ text: line, x: left, y, width: textWidth, size, ascent, descent, padding, page: document.getPageCount(), section, fieldRole, underline, bounds: { x, top, width, height } });
    });
  };
  const stackedHeight = (label, value, width) => heightFor(label, width, bold) + heightFor(value, width);
  const stacked = (label, value, x, top, width, height) => {
    const labelHeight = heightFor(label, width, bold);
    draw(label, x, top, width, labelHeight, { font: bold, section: label });
    draw(value, x, top - labelHeight, width, height - labelHeight, { section: label });
  };
  const fieldHeight = (label, value, width) => heightFor(value, width - bold.widthOfTextAtSize(label, size) - padding * 2);
  const field = (label, value, x, top, width, { align = 'left' } = {}) => {
    const labelWidth = bold.widthOfTextAtSize(label, size) + padding * 2;
    const valueWidth = width - labelWidth;
    const valueHeight = heightFor(value, valueWidth);
    draw(label, x, top, labelWidth, 22, { font: bold, section: label, fieldRole: 'label' });
    draw(value, x + labelWidth, top, valueWidth, valueHeight, { align, section: label, fieldRole: 'value', underlined: true });
  };
  const people = ['approvedBy', 'issuedBy', 'receivedBy'].map(key => data[key] || {});
  const names = people.map(signatoryText);
  const designations = people.map(person => signatoryText(person.designation || person.position));
  const dates = people.map(person => dateText(person.date));
  const signatureLabelWidth = 80;
  const personWidth = (WIDTH - signatureLabelWidth) / 3;
  const nameHeight = Math.max(...names.map(value => heightFor(value, personWidth)));
  const designationHeight = Math.max(...designations.map(value => heightFor(value, personWidth)));
  const remarksHeight = stackedHeight('Remarks:', data.remarks, WIDTH);
  const reasonHeight = stackedHeight('Reason for Transfer:', data.reasonForTransfer, WIDTH);
  const footerHeight = remarksHeight + reasonHeight + 22 + 32 + nameHeight + designationHeight + 22;
  const rowBottom = MARGIN + footerHeight;
  const edges = [MARGIN];
  COLUMNS.forEach(width => edges.push(edges.at(-1) + width));
  const transferType = ['Relocate', 'Relocation'].includes(data.transferType) ? 'Relocate' : data.transferType;
  const choiceValues = ['Donation', 'Reassignment', 'Relocate', 'Others (Specify)'];
  const isOther = Boolean(transferType) && !choiceValues.slice(0, 3).includes(transferType);
  const otherHeight = isOther ? heightFor(data.transferType, WIDTH) : 0;
  const newPage = () => {
    page = document.addPage(PAGE);
    const headingTop = PAGE[1] - MARGIN;
    draw('Appendix 76', MARGIN, headingTop, WIDTH, 20, { align: 'right' });
    draw('PROPERTY TRANSFER REPORT', MARGIN, headingTop - 24, WIDTH, 24, { font: bold, align: 'center' });
    let top = headingTop - 60;
    for (const [label, value] of [['Entity Name:', data.entityName], ['Fund Cluster:', data.fundCluster]]) {
      field(label, value, MARGIN, top, WIDTH);
      top -= fieldHeight(label, value, WIDTH);
    }
    top -= 4;
    const officerWidth = WIDTH * .68;
    const referenceWidth = WIDTH - officerWidth;
    const fromLabel = 'From Accountable Officer/Agency/Fund Cluster:';
    const toLabel = 'To Accountable Officer/Agency/Fund Cluster:';
    const fromOfficer = signatoryText(data.fromAccountableOfficer), toOfficer = signatoryText(data.toAccountableOfficer);
    const fromHeight = Math.max(fieldHeight(fromLabel, fromOfficer, officerWidth), fieldHeight('PTR No.:', data.ptrNumber, referenceWidth));
    const toHeight = Math.max(fieldHeight(toLabel, toOfficer, officerWidth), fieldHeight('Date:', dateText(data.date), referenceWidth));
    for (const [leftLabel, leftValue, rightLabel, rightValue, height] of [[fromLabel, fromOfficer, 'PTR No.:', data.ptrNumber, fromHeight], [toLabel, toOfficer, 'Date:', dateText(data.date), toHeight]]) {
      box(MARGIN, top, officerWidth, height); box(MARGIN + officerWidth, top, referenceWidth, height);
      field(leftLabel, leftValue, MARGIN, top, officerWidth, { align: 'center' });
      field(rightLabel, rightValue, MARGIN + officerWidth, top, referenceWidth);
      top -= height;
    }
    const choiceHeight = 22 + 26 + otherHeight;
    box(MARGIN, top, WIDTH, choiceHeight);
    draw('Transfer Type: (check only one)', MARGIN, top, WIDTH, 22, { font: bold });
    const choiceWidths = [90, 122, 100, WIDTH - 312];
    let x = MARGIN;
    choiceValues.forEach((choice, index) => {
      const checked = choice === 'Others (Specify)' ? isOther : transferType === choice;
      box(x + 6, top - 30, 10, 10);
      if (checked) {
        page.drawLine({ start: { x: x + 8, y: top - 35 }, end: { x: x + 10, y: top - 37 }, thickness: 1 });
        page.drawLine({ start: { x: x + 10, y: top - 37 }, end: { x: x + 14, y: top - 32 }, thickness: 1 });
      }
      draw(choice, x + 20, top - 22, choiceWidths[index] - 20, 26);
      x += choiceWidths[index];
    });
    if (isOther) draw(data.transferType, MARGIN, top - 48, WIDTH, otherHeight);
    top -= choiceHeight;
    const labels = ['Date Acquired', 'Property No.', 'Description', 'Amount', 'Condition of PPE'];
    const headerHeight = Math.max(34, ...labels.map((label, index) => heightFor(label, COLUMNS[index], bold)));
    labels.forEach((label, index) => {
      box(edges[index], top, COLUMNS[index], headerHeight);
      draw(label, edges[index], top, COLUMNS[index], headerHeight, { font: bold, align: 'center' });
    });
    return top - headerHeight;
  };
  const row = (values, top, height, wrapped = false) => values.forEach((value, index) => {
    box(edges[index], top, COLUMNS[index], height);
    draw(value, edges[index], top, COLUMNS[index], height, { align: index === 3 ? 'right' : 'left', section: `item:${index}`, ...(wrapped ? { lines: value } : {}) });
  });
  const footer = top => {
    for (const [label, value, height] of [['Remarks:', data.remarks, remarksHeight], ['Reason for Transfer:', data.reasonForTransfer, reasonHeight]]) {
      box(MARGIN, top, WIDTH, height); stacked(label, value, MARGIN, top, WIDTH, height); top -= height;
    }
    for (const [label, values, height, headings, section] of [['', ['APPROVED BY:', 'RELEASED/ISSUED BY:', 'RECEIVED BY:'], 22, true, 'signatory:heading'], ['SIGNATURE:', ['', '', ''], 32, false, 'signatory:signature'], ['PRINTED NAME:', names, nameHeight, false, 'signatory:name'], ['DESIGNATION:', designations, designationHeight, false, 'signatory:designation'], ['DATE:', dates, 22, false, 'signatory:date']]) {
      box(MARGIN, top, signatureLabelWidth, height); draw(label, MARGIN, top, signatureLabelWidth, height, { align: 'center', section, fieldRole: 'label' });
      values.forEach((value, index) => {
        const x = MARGIN + signatureLabelWidth + index * personWidth;
        box(x, top, personWidth, height);
        draw(value, x, top, personWidth, height, { font: headings ? bold : regular, align: 'center', section, fieldRole: 'value' });
      });
      top -= height;
    }
  };
  let top = newPage();
  if (top - 22 < rowBottom) throw new Error('The PTR header or signatories are too long for one page. Shorten those entries.');
  const maximumRowHeight = top - rowBottom;
  let rows = 0;
  for (const item of items) {
    const values = [dateText(item.dateAcquired), item.propertyNumber, item.description, amountText(item.amount), item.condition];
    const columns = values.map((value, index) => wrap(value, COLUMNS[index] - 10));
    const lineCount = Math.max(...columns.map(lines => lines.length));
    const fullHeight = lineCount * leading + 10;
    if (top - fullHeight < rowBottom && fullHeight <= maximumRowHeight) { footer(top); top = newPage(); rows = 0; }
    let offset = 0;
    while (offset < lineCount) {
      if (top - 22 < rowBottom) { footer(top); top = newPage(); rows = 0; }
      const capacity = Math.floor((top - rowBottom - 10) / leading);
      if (capacity < 1) throw new Error('The PTR header or signatories are too long for one page. Shorten those entries.');
      const count = Math.min(lineCount - offset, capacity);
      const height = count * leading + 10;
      row(columns.map(lines => lines.slice(offset, offset + count)), top, height, true);
      top -= height; rows++; offset += count;
    }
  }
  while (rows < 10 && top - 22 >= rowBottom) { row(Array(5).fill(''), top, 22); top -= 22; rows++; }
  footer(top);
  return document.save();
}
