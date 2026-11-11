import { formNumberData } from './formNumbers.js';
import { risStockNumber } from './risItemSelection.js';
import { displayDate } from './dateInput.js';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedPrintFonts as embedFormFonts, embedSignatureFonts } from './formPdfFonts.js';
import { FORM_PDF_A4_PORTRAIT, FORM_PDF_FONT_SIZE, FORM_PDF_TITLE_SIZE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { signatoryText } from './formPdfSignatories.js';

const PAGE = FORM_PDF_A4_PORTRAIT;
const MARGIN = FORM_PDF_MARGIN;
const WIDTH = PAGE[0] - MARGIN * 2;
const asText = value => value == null ? '' : typeof value === 'object' ? value.name || '' : String(value);
const dateText = displayDate;

export async function buildRisPdf(data, { onDraw } = {}) {
  data = formNumberData(data);
  if (['-', '—'].includes(String(data.responsibilityCenterCode || '').trim())) data.responsibilityCenterCode = '';
  const document = await PDFDocument.create();
  const { regular, bold, titleBold, titleRegular } = await embedFormFonts(document, ['regular', 'bold']);
  const { signatureRegular, signatureBold } = await embedSignatureFonts(document);
  const size = FORM_PDF_FONT_SIZE, leading = 12, padding = 4;
  const designationFontSize = 8, designationLeading = 10;
  const minimumRowHeight = 20;
  const items = Array.isArray(data.items) ? data.items : [];
  const valuesFor = item => [risStockNumber(item), item.unit, item.description ?? item.item, item.quantityRequested, item.isAvailable == null ? '' : item.isAvailable ? '/' : '', item.isAvailable === false ? '/' : '', Number(item.quantityIssued) > 0 ? item.quantityIssued : '', item.remarks];
  const measuredWidth = (index, minimum, maximum) => Math.min(maximum, Math.max(minimum, ...items.map(item => regular.widthOfTextAtSize(asText(valuesFor(item)[index]), size) + padding * 2)));
  const stockWidth = measuredWidth(0, WIDTH * .10, 120), unitWidth = measuredWidth(1, WIDTH * .05, 60);
  const requestedWidth = measuredWidth(3, WIDTH * .08, 80), issuedWidth = measuredWidth(6, WIDTH * .09, 80);
  const proseWidth = WIDTH - stockWidth - unitWidth - requestedWidth - issuedWidth - WIDTH * .14;
  const descriptionWidth = Math.max(95, Math.min(WIDTH * .35, proseWidth - 45));
  const COLUMNS = [stockWidth, unitWidth, descriptionWidth, requestedWidth, WIDTH * .07, WIDTH * .07, issuedWidth, proseWidth - descriptionWidth];
  const wrap = (value, width, font = regular, fontSize = size) => {
    const lines = [];
    for (const paragraph of asText(value).split(/\r?\n/)) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, fontSize) > width) { lines.push(line); line = ''; }
        for (const [partIndex, part] of (word.match(/[^/_-]+[/_-]?|[/_-]/g) || [word]).entries()) {
          let separator = partIndex === 0 && line ? ' ' : '';
          if (line && font.widthOfTextAtSize(line + separator + part, fontSize) > width) { lines.push(line); line = ''; separator = ''; }
          for (const character of `${separator}${part}`) {
            if (line && font.widthOfTextAtSize(line + character, fontSize) > width) { lines.push(line); line = ''; }
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
  const draw = (value, x, top, width, height, { font = regular, fontSize = size, lineLeading = leading, align = 'left', section = '', fieldRole, lines = wrap(value, width - 8, font, fontSize) } = {}) => {
    const ascent = font.heightAtSize(fontSize, { descender: false });
    const textHeight = font.heightAtSize(fontSize), descent = textHeight - ascent;
    const blockHeight = textHeight + (lines.length - 1) * lineLeading;
    const first = top - (height - blockHeight) / 2 - ascent;
    lines.forEach((line, index) => {
      if (!line) return;
      const textWidth = font.widthOfTextAtSize(line, fontSize);
      const left = align === 'center' ? x + (width - textWidth) / 2 : align === 'right' ? x + width - textWidth - 4 : x + 4;
      const y = first - index * lineLeading;
      page.drawText(line, { x: left, y, size: fontSize, font });
      onDraw?.({ text: line, x: left, y, width: textWidth, size: fontSize, ascent, descent, padding, page: document.getPageCount(), section, fieldRole, bounds: { x, top, width, height } });
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
  const nameHeight = Math.max(22, ...names.map(value => wrap(value, personWidth - 8, signatureRegular).length * leading + 8));
  const designationHeight = Math.max(22, ...designations.map(value => wrap(value, personWidth - 8, signatureRegular, designationFontSize).length * designationLeading + 8));
  const purposeHeight = Math.max(54, fieldHeight('Purpose:', data.purpose, WIDTH));
  const footerHeight = purposeHeight + 22 + 28 + nameHeight + designationHeight + 22;
  const rowBottom = MARGIN + footerHeight;
  const edges = [MARGIN]; COLUMNS.forEach(width => edges.push(edges.at(-1) + width));
  const newPage = () => {
    page = document.addPage(PAGE);
    const headingTop = PAGE[1] - MARGIN;
    draw('Appendix 63', MARGIN, headingTop, WIDTH, 18, { align: 'right' });
    draw('REQUISITION AND ISSUE SLIP', MARGIN, headingTop - 24, WIDTH, 32, { font: titleBold, fontSize: FORM_PDF_TITLE_SIZE, align: 'center', section: 'form title' });
    let top = headingTop - 60;
    const agencyWidth = WIDTH * .59;
    const agencyHeight = Math.max(fieldHeight('Entity Name:', data.entityName, agencyWidth), fieldHeight('Fund Cluster:', data.fundCluster, WIDTH - agencyWidth));
    field('Entity Name:', data.entityName, MARGIN, top, agencyWidth, agencyHeight);
    field('Fund Cluster:', data.fundCluster, MARGIN + agencyWidth, top, WIDTH - agencyWidth, agencyHeight);
    for (const [label, x, width] of [['Entity Name:', MARGIN, agencyWidth], ['Fund Cluster:', MARGIN + agencyWidth, WIDTH - agencyWidth]]) {
      const labelWidth = bold.widthOfTextAtSize(label, size) + 12;
      page.drawLine({ start: { x: x + labelWidth + 4, y: top - agencyHeight + 2 }, end: { x: x + width - 4, y: top - agencyHeight + 2 }, thickness: 0.5 });
    }
    top -= agencyHeight + 4;
    const requisitionWidth = edges[4] - MARGIN;
    const referenceWidth = WIDTH - requisitionWidth;
    const metadataHeight = Math.max(44,
      fieldHeight('Division:', data.division, requisitionWidth) + fieldHeight('Office:', data.office, requisitionWidth),
      fieldHeight('Responsibility Center Code:', data.responsibilityCenterCode, referenceWidth) + fieldHeight('RIS No.:', data.risNumber, referenceWidth));
    box(MARGIN, top, requisitionWidth, metadataHeight);
    box(edges[4], top, referenceWidth, metadataHeight);
    const lineHeight = metadataHeight / 2, leftLabelWidth = 52;
    page.drawLine({ start: { x: MARGIN + leftLabelWidth, y: top }, end: { x: MARGIN + leftLabelWidth, y: top - metadataHeight }, thickness: .65 });
    for (const [index, label, value] of [[0, 'Division:', data.division], [1, 'Office:', data.office]]) {
      draw(label, MARGIN, top - index * lineHeight, leftLabelWidth, lineHeight);
      draw(value, MARGIN + leftLabelWidth, top - index * lineHeight, requisitionWidth - leftLabelWidth, lineHeight);
      page.drawLine({ start: { x: MARGIN + leftLabelWidth, y: top - (index + 1) * lineHeight + 2 }, end: { x: edges[4] - 4, y: top - (index + 1) * lineHeight + 2 }, thickness: .5 });
    }
    field('Responsibility Center Code:', data.responsibilityCenterCode, edges[4], top, referenceWidth, lineHeight);
    field('RIS No.:', data.risNumber, edges[4], top - lineHeight, referenceWidth, lineHeight);
    top -= metadataHeight;
    const groups = [['Requisition', 0, 4], ['Stock Available?', 4, 6], ['', 6, 8]];
    const groupHeight = Math.max(24, ...groups.map(([label, start, end]) => wrap(label, edges[end] - edges[start] - 8, bold).length * leading + 8));
    for (const [label, start, end] of groups) {
      box(edges[start], top, edges[end] - edges[start], groupHeight);
      draw(label, edges[start], top, edges[end] - edges[start], groupHeight, { font: bold, align: 'center', section: 'table:group' });
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
      draw(value, edges[index], top, COLUMNS[index], height, { align: 'center', section: `item:${index}`, ...(wrapped ? { lines: value } : {}) });
    });
  };
  const footer = top => {
    box(MARGIN, top, WIDTH, purposeHeight);
    const purposeLabelWidth = 76;
    draw('Purpose:', MARGIN, top, purposeLabelWidth, 22, { font: bold });
    draw(data.purpose, MARGIN + purposeLabelWidth, top, WIDTH - purposeLabelWidth, purposeHeight);
    for (let offset = 18; offset < purposeHeight; offset += 18) {
      page.drawLine({ start: { x: MARGIN + purposeLabelWidth, y: top - offset }, end: { x: MARGIN + WIDTH, y: top - offset }, thickness: .5 });
    }
    top -= purposeHeight;
    for (const [label, values, height, headings, section] of [['', ['REQUESTED BY:', 'APPROVED BY:', 'ISSUED BY:', 'RECEIVED BY:'], 22, true, 'signatory:heading'], ['SIGNATURE:', ['', '', '', ''], 28, false, 'signatory:signature'], ['PRINTED NAME:', names, nameHeight, false, 'signatory:name'], ['DESIGNATION:', designations, designationHeight, false, 'signatory:designation'], ['DATE:', dates, 22, false, 'signatory:date']]) {
      box(MARGIN, top, signatureLabelWidth, height); draw(label, MARGIN, top, signatureLabelWidth, height, { font: signatureRegular, align: 'center', section, fieldRole: 'label' });
      values.forEach((value, index) => { const x = MARGIN + signatureLabelWidth + index * personWidth; box(x, top, personWidth, height); draw(value, x, top, personWidth, height, { font: headings ? signatureBold : signatureRegular, fontSize: section === 'signatory:designation' ? designationFontSize : size, lineLeading: section === 'signatory:designation' ? designationLeading : leading, align: 'center', section, fieldRole: 'value', ...(section === 'signatory:designation' ? { lines: wrap(value, personWidth - 8, signatureRegular, designationFontSize) } : {}) }); });
      top -= height;
    }
  };
  const finishPage = top => {
    const remaining = top - rowBottom;
    if (remaining > .01) {
      const count = Math.max(1, Math.floor(remaining / minimumRowHeight));
      const height = remaining / count;
      for (let index = 0; index < count; index++) { drawRow(Array(8).fill(''), top, height); top -= height; }
    }
    footer(rowBottom);
  };
  let top = newPage();
  if (top - minimumRowHeight < rowBottom) throw new Error('The RIS header or signatories are too long for one page. Shorten those entries.');
  const maximumRowHeight = top - rowBottom;
  for (const item of items) {
    const columns = valuesFor(item).map((value, index) => wrap(value, COLUMNS[index] - 8));
    const lineCount = Math.max(...columns.map(lines => lines.length));
    const fullHeight = Math.max(minimumRowHeight, lineCount * leading + 8);
    if (top - fullHeight < rowBottom && fullHeight <= maximumRowHeight) { finishPage(top); top = newPage(); }
    let offset = 0;
    while (offset < lineCount) {
      if (top - minimumRowHeight < rowBottom) { finishPage(top); top = newPage(); }
      const capacity = Math.floor((top - rowBottom - 8) / leading);
      if (capacity < 1) throw new Error('The RIS header or signatories are too long for one page. Shorten those entries.');
      const count = Math.min(lineCount - offset, capacity);
      const height = Math.max(minimumRowHeight, count * leading + 8);
      drawRow(columns.map(lines => lines.slice(offset, offset + count)), top, height, true);
      top -= height; offset += count;
    }
  }
  finishPage(top);
  return document.save();
}
