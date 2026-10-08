import { rgb } from 'pdf-lib';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_A4_PORTRAIT, FORM_PDF_FONT_SIZE, FORM_PDF_MARGIN } from './formPdfStyle.js';
import { isFormSignatoryField, signatoryText } from './formPdfSignatories.js';

const columns = {
  iar: ['stockNumber', 'description', 'unit', 'quantity'],
  pc: ['date', 'referenceParNo', 'receiptQuantity', 'itdQuantity', 'itdOfficeOfficer', 'balanceQuantity', 'amount', 'remarks'],
  ics: ['quantity', 'unit', 'unitCost', 'totalCost', 'description', 'inventoryItemNo', 'estimatedUsefulLife'],
  par: ['quantity', 'unit', 'description', 'propertyNumber', 'dateAcquired', 'amount'],
  prs: ['quantity', 'unit', 'description', 'propertyNumber', 'mrNumber', 'endUser', 'unitValue', 'totalValue'],
};
const captions = {
  entityName: 'Entity Name', lguName: 'Local Government Unit', fundCluster: 'Fund Cluster',
  supplierName: 'Supplier', poNumber: 'PO/JO No.', reqOffice: 'Requisitioning Office', rcc: 'Responsibility Center Code',
  iarNumber: 'IAR No.', iarDate: 'IAR Date', invoiceNumber: 'Invoice No.', invoiceDate: 'Invoice Date',
  inspectionDate: 'Inspection Date', acceptanceDate: 'Acceptance Date', inspectedBy: 'Inspection Officer/Committee', acceptedBy: 'Supply/Property Custodian',
  month: 'Month', propertyPlantAndEquipment: 'Property, Plant and Equipment', description: 'Description', propertyNumber: 'Property Number', serialNumber: 'S/N',
  icsNumber: 'ICS No.', parNumber: 'PAR No.', totalAmount: 'Total Amount', remarks: 'Remarks', purpose: 'Purpose', note: 'Note',
};
const monetary = new Set(['amount', 'unitCost', 'totalCost', 'unitValue', 'totalValue', 'totalAmount']);
const centered = /quantity|^date|^unit$/i;
const lineHeight = 11;
export const TEMPLATE_CELL_PADDING = 5;
export const TEMPLATE_ROW_LINE_HEIGHT = 12;
const minimumRowHeight = 22;
const tableDefinitions = {
  iar: { left: 90, right: 522, top: 612, bottom: 273, widths: [82, 221, 63, 66], labels: ['Stock / Property No.', 'Description', 'Unit', 'Quantity'] },
  pc: { left: 75, right: 766, top: 380, bottom: 80, widths: [60, 84, 50, 50, 205, 50, 85, 107], labels: ['Date', 'Reference / PAR No.', 'Qty.', 'Qty.', 'Office / Officer', 'Qty.', 'Amount', 'Remarks'], groups: [{ start: 2, count: 1, label: 'Receipt' }, { start: 3, count: 2, label: 'Issue / Transfer / Disposal' }, { start: 5, count: 1, label: 'Balance' }] },
  ics: { left: 90, right: 523, top: 680, bottom: 319, widths: [46, 37, 60, 65, 95, 72, 58], labels: ['Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Description', 'Inventory Item No.', 'Estimated Useful Life'], groups: [{ start: 2, count: 2, label: 'Amount' }], footers: [{ key: 'totalAmount', label: 'TOTAL', start: 2, count: 2 }, { key: 'remarks', label: 'Remarks:', start: 2, count: 5 }] },
  par: { left: 92, right: 520, top: 677, bottom: 318, widths: [46, 37, 140, 71, 62, 72], labels: ['Quantity', 'Unit', 'Description', 'Property Number', 'Date Acquired', 'Amount'], footers: [{ key: 'totalAmount', label: 'TOTAL', start: 5, count: 1 }, { key: 'remarks', label: 'Remarks:', start: 1, count: 5 }] },
  prs: { left: 51, right: 531, top: 671, bottom: 346, widths: [35, 35, 89, 65, 66, 70, 60, 60], labels: ['Qty.', 'Unit', 'Description', 'Property Number', 'M.R. No.', 'Name of End User', 'Unit Value', 'Total Value'], footers: [{ key: 'note', label: 'NOTE:', start: 2, count: 6 }, { key: 'totalAmount', label: 'TOTAL', start: 7, count: 1 }, { label: 'CERTIFICATION' }] },
};

export function wrapTemplateText(value, font, width) {
  const result = [];
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const joined = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(joined, FORM_PDF_FONT_SIZE) <= width) { line = joined; continue; }
      if (line) { result.push(line); line = ''; }
      // Keep identifiers and long words visible too, even without spaces.
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, FORM_PDF_FONT_SIZE) > width) { result.push(line); line = ''; }
        line += character;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
}

export function templateRowLayout(template, font) {
  const original = tableDefinitions[template];
  if (!original) throw new Error('Unable to locate the official form table');
  const pageSize = template === 'pc' ? FORM_PDF_A4_LANDSCAPE : FORM_PDF_A4_PORTRAIT;
  const width = pageSize[0] - FORM_PDF_MARGIN * 2;
  const originalWidth = original.widths.reduce((sum, value) => sum + value, 0);
  const definition = { ...original, left: FORM_PDF_MARGIN, right: pageSize[0] - FORM_PDF_MARGIN, top: { iar: 624, pc: 430, ics: 714, par: 714, prs: 714 }[template], bottom: { iar: 206, pc: FORM_PDF_MARGIN, ics: 180, par: 192, prs: 214 }[template], widths: original.widths.map(value => value / originalWidth * width) };
  let x = definition.left;
  const tableColumns = columns[template].map((key, index) => {
    const width = definition.widths[index];
    const label = definition.labels[index];
    const column = { key, label, x, width, lines: wrapTemplateText(label, font, width - TEMPLATE_CELL_PADDING * 2) };
    x += width;
    return column;
  });
  const groups = (definition.groups || []).map(group => {
    const first = tableColumns[group.start];
    const width = tableColumns.slice(group.start, group.start + group.count).reduce((sum, column) => sum + column.width, 0);
    return { ...group, x: first.x, width, lines: wrapTemplateText(group.label, font, width - TEMPLATE_CELL_PADDING * 2) };
  });
  const groupHeight = groups.length ? Math.max(...groups.map(group => group.lines.length)) * TEMPLATE_ROW_LINE_HEIGHT + TEMPLATE_CELL_PADDING * 2 : 0;
  const childHeight = Math.max(...tableColumns.filter((column, index) => groups.some(group => index >= group.start && index < group.start + group.count)).map(column => column.lines.length), 0) * TEMPLATE_ROW_LINE_HEIGHT + TEMPLATE_CELL_PADDING * 2;
  const standaloneHeight = Math.max(...tableColumns.map(column => column.lines.length)) * TEMPLATE_ROW_LINE_HEIGHT + TEMPLATE_CELL_PADDING * 2;
  const headerHeight = Math.max(standaloneHeight, groups.length ? groupHeight + childHeight : 0);
  const footerHeight = 20;
  const footers = definition.footers || [];
  const bodyTop = definition.top - headerHeight;
  const bodyBottom = definition.bottom + footers.length * footerHeight;
  const headerBounds = {};
  footers.forEach((footer, index) => {
    if (!footer.key) return;
    const first = tableColumns[footer.start];
    const width = tableColumns.slice(footer.start, footer.start + footer.count).reduce((sum, column) => sum + column.width, 0);
    const y = bodyBottom - (index + 1) * footerHeight;
    headerBounds[footer.key] = { x: first.x + TEMPLATE_CELL_PADDING - 1, y: y + TEMPLATE_CELL_PADDING, width: width - TEMPLATE_CELL_PADDING * 2 + 2, height: footerHeight - TEMPLATE_CELL_PADDING * 2, cellBounds: { x: first.x, y, width, height: footerHeight } };
  });
  const signatures = signatureLayout(template, definition);
  for (const field of signatures?.fields || []) headerBounds[field.key] = field.bounds;
  return { ...definition, pageSize, template, signatures, columns: tableColumns, groups, groupHeight, headerHeight, footerHeight, footers, bodyTop, bodyBottom, headerBounds, capacity: bodyTop - bodyBottom };
}

function signatureLayout(template, table) {
  if (!['iar', 'ics', 'par', 'prs'].includes(template)) return null;
  const panelWidth = (table.right - table.left) / 2;
  const bottom = FORM_PDF_MARGIN;
  const panels = [table.left, table.left + panelWidth].map(x => ({ x, y: bottom, width: panelWidth, height: table.bottom - bottom }));
  const fields = [];
  const rules = [];
  const add = (key, panel, y, inset = 20) => {
    fields.push({ key, bounds: { x: panel.x + inset - 1, y, width: panel.width - inset * 2 + 2, height: 10 } });
  };
  if (template === 'ics' || template === 'par') {
    const prefixes = template === 'ics' ? ['receivedFrom', 'receivedBy'] : ['receivedBy', 'issuedBy'];
    const ys = [table.bottom - 52, table.bottom - 92, table.bottom - 126];
    panels.forEach((panel, index) => {
      ['Name', 'Position', 'Date'].forEach((suffix, offset) => {
        add(`${prefixes[index]}${suffix}`, panel, ys[offset]);
        rules.push({ x: panel.x + 20, y: ys[offset] - 2, width: panel.width - 40 });
      });
    });
  } else if (template === 'prs') {
    const [left, right] = panels;
    add('returnedToName1', left, table.bottom - 83);
    add('returnedToDesignation1', left, table.bottom - 99);
    add('returnedToName2', left, table.bottom - 149);
    add('returnedToDesignation2', left, table.bottom - 165);
    add('returnedByName', right, table.bottom - 83);
    add('returnedBy', right, table.bottom - 149);
    add('returnedByPosition', right, table.bottom - 165);
    for (const [key, panel] of [['returnedToDate', left], ['returnedByDate', right]]) fields.push({ key, bounds: { x: panel.x + 5, y: table.bottom - 55, width: 115, height: 11 } });
    for (const [panel, y] of [[left, table.bottom - 86], [left, table.bottom - 152], [right, table.bottom - 86], [right, table.bottom - 152]]) rules.push({ x: panel.x + 20, y, width: panel.width - 40 });
  } else {
    const [left, right] = panels;
    for (const [key, panel, y] of [['inspectionDate', left, table.bottom - 40], ['acceptanceDate', right, table.bottom - 40], ['inspectedBy', left, table.bottom - 146], ['acceptedBy', right, table.bottom - 146]]) {
      add(key, panel, y);
      rules.push({ x: panel.x + 20, y: y - 2, width: panel.width - 40 });
    }
  }
  return { panels, fields, rules, bottom };
}

export function paginateTemplateItems(items, layout, font, valueFor, options = {}) {
  const pages = [];
  let page = [];
  let used = 0;
  for (const [itemIndex, item] of items.entries()) {
    const cells = Object.fromEntries(layout.columns.map(column => {
      const value = valueFor(column.key, item);
      const available = column.width - TEMPLATE_CELL_PADDING * 2;
      if ((monetary.has(column.key) || /quantity|^date/i.test(column.key)) && font.widthOfTextAtSize(value, FORM_PDF_FONT_SIZE) > available) {
        options.onOverflow?.({ key: column.key, caption: `Item ${itemIndex + 1} — ${fieldCaption(column.key)}`, value });
        return [column.key, ['…']];
      }
      return [column.key, wrapTemplateText(value, font, available)];
    }));
    const lineCount = Math.max(1, ...Object.values(cells).map(lines => lines.length));
    const height = Math.max(minimumRowHeight, lineCount * TEMPLATE_ROW_LINE_HEIGHT + TEMPLATE_CELL_PADDING * 2);
    if (height <= layout.capacity && page.length && used + height > layout.capacity) { pages.push(page); page = []; used = 0; }
    for (let line = 0; line < lineCount;) {
      let fit = Math.floor((layout.capacity - used - TEMPLATE_CELL_PADDING * 2) / TEMPLATE_ROW_LINE_HEIGHT);
      if (fit < 1) { pages.push(page); page = []; used = 0; fit = Math.floor((layout.capacity - TEMPLATE_CELL_PADDING * 2) / TEMPLATE_ROW_LINE_HEIGHT); }
      if (fit < 1) throw new Error('The official form table has no space for item text');
      const count = Math.min(lineCount - line, fit);
      const rowHeight = Math.max(minimumRowHeight, count * TEMPLATE_ROW_LINE_HEIGHT + TEMPLATE_CELL_PADDING * 2);
      page.push({ ...Object.fromEntries(layout.columns.map(column => [column.key, cells[column.key].slice(line, line + count)])), _continued: line > 0, _height: rowHeight });
      used += rowHeight;
      line += count;
      if (line < lineCount) { pages.push(page); page = []; used = 0; }
    }
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function drawValue(page, font, value, bounds, options, alignment = 'left') {
  if (!value) return;
  const width = font.widthOfTextAtSize(value, FORM_PDF_FONT_SIZE);
  const ascent = font.heightAtSize(FORM_PDF_FONT_SIZE, { descender: false });
  const height = font.heightAtSize(FORM_PDF_FONT_SIZE);
  const x = bounds.x + (alignment === 'right' ? bounds.width - width : alignment === 'center' ? (bounds.width - width) / 2 : 0);
  const y = bounds.y + (bounds.height - height) / 2 + height - ascent;
  page.drawText(value, { x, y, font, size: FORM_PDF_FONT_SIZE });
  options.onDraw?.({ text: value, x, y, width, height, ascent, size: FORM_PDF_FONT_SIZE, bounds, cellBounds: options.cellBounds, page: options.page, section: options.section });
}

function tableCell(page, bounds) {
  page.drawRectangle({ ...bounds, borderWidth: .65, borderColor: rgb(0, 0, 0) });
}

function tableLines(page, font, lines, cellBounds, options, alignment = 'left') {
  const height = font.heightAtSize(FORM_PDF_FONT_SIZE);
  const blockHeight = height + (lines.length - 1) * TEMPLATE_ROW_LINE_HEIGHT;
  const content = { x: cellBounds.x + TEMPLATE_CELL_PADDING, y: cellBounds.y + TEMPLATE_CELL_PADDING, width: cellBounds.width - TEMPLATE_CELL_PADDING * 2, height: cellBounds.height - TEMPLATE_CELL_PADDING * 2 };
  const firstBottom = cellBounds.y + (cellBounds.height - blockHeight) / 2 + (lines.length - 1) * TEMPLATE_ROW_LINE_HEIGHT;
  lines.forEach((line, index) => drawValue(page, font, line, { ...content, y: firstBottom - index * TEMPLATE_ROW_LINE_HEIGHT, height }, { ...options, cellBounds }, alignment));
}

export function drawTemplateTableFrame(page, fonts, rows, layout, options = {}) {
  const font = fonts.bold;
  layout.columns.forEach((column, index) => {
    const grouped = layout.groups.some(group => index >= group.start && index < group.start + group.count);
    const cell = { x: column.x, y: layout.bodyTop, width: column.width, height: layout.headerHeight - (grouped ? layout.groupHeight : 0) };
    tableCell(page, cell);
    tableLines(page, font, column.lines, cell, { ...options, section: 'table caption' }, 'center');
  });
  for (const group of layout.groups) {
    const cell = { x: group.x, y: layout.top - layout.groupHeight, width: group.width, height: layout.groupHeight };
    tableCell(page, cell);
    tableLines(page, font, group.lines, cell, { ...options, section: 'table group caption' }, 'center');
  }
  let y = layout.bodyTop;
  for (const row of rows) {
    y -= row._height;
    for (const column of layout.columns) tableCell(page, { x: column.x, y, width: column.width, height: row._height });
  }
  const remaining = y - layout.bodyBottom;
  const blankCount = Math.max(1, Math.floor(remaining / minimumRowHeight));
  if (remaining > .01) for (let index = 0; index < blankCount; index++) {
    const height = remaining / blankCount;
    y -= height;
    for (const column of layout.columns) tableCell(page, { x: column.x, y, width: column.width, height });
  }
  layout.footers.forEach((footer, index) => {
    const y = layout.bodyBottom - (index + 1) * layout.footerHeight;
    const valueColumn = footer.key ? layout.columns[footer.start] : null;
    const labelWidth = valueColumn ? valueColumn.x - layout.left : layout.right - layout.left;
    const labelCell = { x: layout.left, y, width: labelWidth, height: layout.footerHeight };
    tableCell(page, labelCell);
    tableLines(page, fonts.regular, [footer.label], labelCell, { ...options, section: footer.key === 'remarks' ? 'remarks caption' : 'table footer caption' }, footer.key === 'totalAmount' ? 'right' : 'center');
    if (valueColumn) {
      const valueWidth = layout.columns.slice(footer.start, footer.start + footer.count).reduce((sum, column) => sum + column.width, 0);
      tableCell(page, { x: valueColumn.x, y, width: valueWidth, height: layout.footerHeight });
      if (valueColumn.x + valueWidth < layout.right) tableCell(page, { x: valueColumn.x + valueWidth, y, width: layout.right - valueColumn.x - valueWidth, height: layout.footerHeight });
    }
  });
  drawSignaturePanels(page, fonts, layout, options);
}

function drawSignaturePanels(page, fonts, layout, options) {
  if (!layout.signatures) return;
  const { panels, rules } = layout.signatures;
  for (const panel of panels) tableCell(page, panel);
  for (const rule of rules) page.drawLine({ start: { x: rule.x, y: rule.y }, end: { x: rule.x + rule.width, y: rule.y }, thickness: .65 });
  if (layout.template === 'ics' || layout.template === 'par') {
    const isIcs = layout.template === 'ics';
    panels.forEach((panel, index) => {
      const label = isIcs ? index ? 'Received by:' : 'Received from:' : index ? 'Issued by:' : 'Received by:';
      tableLines(page, fonts.bold, [label.toUpperCase()], { x: panel.x, y: layout.bottom - 20, width: panel.width, height: 20 }, { ...options, section: 'signatory caption' }, 'center');
      const captions = isIcs ? [['Signature Over Printed Name', layout.bottom - 67], ['Position / Office', layout.bottom - 107], ['Date', layout.bottom - 141]] : [['Signature over Printed Name', layout.bottom - 67], [index ? 'of Property Custodian' : 'of End User', layout.bottom - 79], ['Position / Office', layout.bottom - 107], ['Date', layout.bottom - 141]];
      for (const [text, y] of captions) drawValue(page, fonts.regular, text.toUpperCase(), { x: panel.x + 10, y, width: panel.width - 20, height: 12 }, { ...options, section: !isIcs && index && y >= layout.bottom - 79 ? 'property custodian caption' : 'signature field caption' }, 'center');
    });
    return;
  }
  if (layout.template === 'iar') {
    panels.forEach((panel, index) => {
      tableLines(page, fonts.bold, [index ? 'ACCEPTANCE' : 'INSPECTION'], { x: panel.x, y: layout.bottom - 22, width: panel.width, height: 22 }, { ...options, section: 'signatory caption' }, 'center');
      drawValue(page, fonts.regular, index ? 'DATE RECEIVED:' : 'DATE INSPECTED:', { x: panel.x + 20, y: layout.bottom - 29, width: panel.width - 40, height: 11 }, { ...options, section: 'signature field caption' }, 'center');
      drawValue(page, fonts.regular, index ? 'SUPPLY AND/OR PROPERTY CUSTODIAN' : 'INSPECTION OFFICER / INSPECTION COMMITTEE', { x: panel.x + 10, y: layout.bottom - 165, width: panel.width - 20, height: 12 }, { ...options, section: 'signature field caption' }, 'center');
    });
    return;
  }
  panels.forEach((panel, index) => {
    const statement = index ? 'I HEREBY CERTIFY THAT I RETURNED THIS UNIT/ITEM ON' : 'I HEREBY CERTIFY THAT I HAVE RECEIVED THE ITEM/UNIT THIS';
    tableLines(page, fonts.regular, wrapTemplateText(statement, fonts.regular, panel.width - 12), { x: panel.x, y: layout.bottom - 36, width: panel.width, height: 36 }, { ...options, section: 'certification statement' }, 'center');
    drawValue(page, fonts.regular, index ? 'RECEIVED FROM:' : 'RETURNED TO:', { x: panel.x + 126, y: layout.bottom - 55, width: panel.width - 132, height: 12 }, { ...options, section: 'certification caption' }, 'center');
    if (index) drawValue(page, fonts.regular, 'RETURNED BY:', { x: panel.x + 10, y: layout.bottom - 108, width: panel.width - 20, height: 12 }, { ...options, section: 'certification caption' }, 'center');
    drawValue(page, fonts.regular, 'THE ITEMS/ARTICLES DESCRIBED ABOVE', { x: panel.x + 10, y: layout.bottom - 124, width: panel.width - 20, height: 12 }, { ...options, section: 'certification caption' }, 'center');
  });
}

export function drawTemplateRows(page, font, rows, layout, options = {}) {
  let y = layout.bodyTop;
  for (const row of rows) {
    y -= row._height;
    for (const column of layout.columns) {
      const lines = row[column.key];
      if (!lines.length) continue;
      tableLines(page, font, lines, { x: column.x, y, width: column.width, height: row._height }, { ...options, section: column.key }, monetary.has(column.key) ? 'right' : centered.test(column.key) ? 'center' : 'left');
    }
  }
}

function drawChoice(page, font, text, key, checked, x, top, width, options) {
  const lines = wrapTemplateText(text, font, width - 25);
  const height = Math.max(22, lines.length * TEMPLATE_ROW_LINE_HEIGHT + 10);
  const bounds = { x: x + 19, y: top - height, width: width - 19, height };
  const glyphHeight = font.heightAtSize(FORM_PDF_FONT_SIZE);
  const blockHeight = glyphHeight + (lines.length - 1) * TEMPLATE_ROW_LINE_HEIGHT;
  const y = top - (height - blockHeight) / 2 - glyphHeight / 2 - 5.5;
  const box = { x: x + 2, y, width: 11, height: 11 };
  page.drawRectangle({ ...box, borderWidth: .65, borderColor: rgb(0, 0, 0) });
  tableLines(page, font, lines, bounds, { ...options, section: key });
  options.onChoice?.({ key, checked, bounds: box, page: options.page });
  if (checked) {
    page.drawLine({ start: { x: box.x + 2, y: y + 5.5 }, end: { x: box.x + 4.5, y: y + 3 }, thickness: 1 });
    page.drawLine({ start: { x: box.x + 4.5, y: y + 3 }, end: { x: box.x + 9, y: y + 8 }, thickness: 1 });
  }
}

export function drawStandardFormHeaders(page, fonts, layout, valueFor, data, options = {}) {
  const { template, left, right, pageSize } = layout;
  const width = right - left, half = width / 2;
  const top = pageSize[1] - FORM_PDF_MARGIN;
  const titles = { iar: 'INSPECTION AND ACCEPTANCE REPORT', pc: 'PROPERTY CARD', ics: 'INVENTORY CUSTODIAN SLIP', par: 'PROPERTY ACKNOWLEDGMENT RECEIPT', prs: 'PROPERTY RETURN SLIP' };
  const appendices = { iar: '62', pc: '69', ics: '59', par: '71' };
  if (appendices[template]) drawValue(page, fonts.regular, `Appendix ${appendices[template]}`, { x: left, y: top - 12, width, height: 12 }, { ...options, section: 'appendix' }, 'right');
  drawValue(page, fonts.bold, titles[template], { x: left, y: top - 47, width, height: 22 }, { ...options, section: 'form title' }, 'center');
  const fields = [];
  const add = (label, key, x, y, fieldWidth) => {
    const labelWidth = fonts.bold.widthOfTextAtSize(label, FORM_PDF_FONT_SIZE) + 3;
    drawValue(page, fonts.bold, label, { x, y, width: labelWidth, height: 12 }, { ...options, section: `${key} caption` });
    const rectangle = { x: x + labelWidth, y, width: fieldWidth - labelWidth, height: 12 };
    fields.push({ key, rectangle });
    page.drawLine({ start: { x: rectangle.x, y: y - 1 }, end: { x: x + fieldWidth, y: y - 1 }, thickness: .5 });
  };
  const pair = (y, first, second) => {
    add(`${first[0]}:`, first[1], left, y, half - 10);
    add(`${second[0]}:`, second[1], left + half, y, half);
  };
  if (template === 'iar') {
    pair(754, ['Entity Name', 'entityName'], ['Fund Cluster', 'fundCluster']);
    pair(730, ['Supplier', 'supplierName'], ['PO No. / Date', 'poNumber']);
    add('Responsibility Center Code:', 'rcc', left, 706, width);
    pair(682, ['IAR No.', 'iarNumber'], ['IAR Date', 'iarDate']);
    pair(658, ['Invoice No.', 'invoiceNumber'], ['Invoice Date', 'invoiceDate']);
    // The original PO heading combines its number and date in one field.
    const originalValueFor = valueFor;
    valueFor = key => key === 'poNumber' ? [originalValueFor(key), originalValueFor('poDate') || originalValueFor('purchaseDate')].filter(Boolean).join(' / ') : originalValueFor(key);
    const [inspection, acceptance] = layout.signatures.panels;
    drawChoice(page, fonts.regular, 'Inspected, verified and found in order as to quantity and specifications', 'inspection', false, inspection.x + 12, layout.bottom - 60, inspection.width - 24, options);
    drawChoice(page, fonts.regular, 'Complete', 'Complete', data.acceptanceStatus === 'Complete', acceptance.x + 12, layout.bottom - 60, acceptance.width - 24, options);
    drawChoice(page, fonts.regular, 'Partial (pls. specify quantity)', 'Partial', data.acceptanceStatus === 'Partial', acceptance.x + 12, layout.bottom - 87, acceptance.width - 24, options);
    if (data.acceptanceStatus === 'Partial') fields.push({ key: 'acceptanceQuantity', rectangle: { x: acceptance.x + 34, y: layout.bottom - 119, width: acceptance.width - 54, height: 11 } });
  } else if (template === 'pc') {
    pair(508, ['Month', 'month'], ['PO No.', 'poNumber']);
    pair(484, ['Entity Name', 'entityName'], ['Fund Cluster', 'fundCluster']);
    pair(460, ['Property, Plant and Equipment', 'propertyPlantAndEquipment'], ['Property Number', 'propertyNumber']);
    pair(436, ['Description', 'description'], ['S/N', 'serialNumber']);
  } else if (template === 'prs') {
    add('Name of Local Government Unit:', 'lguName', left, 754, width * .7 - 10);
    add('PRS No.:', 'prsNumber', left + width * .7, 754, width * .3);
    drawValue(page, fonts.regular, 'Purpose:', { x: left, y: 725, width: 40, height: 12 }, { ...options, section: 'purpose caption' });
    let x = left + 44;
    for (const [key, label, choiceWidth] of [['disposal', 'Disposal', 72], ['repair', 'Repair', 64], ['returnedToStock', 'Returned to Stock', 123], ['other', 'Other:', 75]]) {
      drawChoice(page, fonts.regular, label, key, Boolean(valueFor(key)), x, 744, choiceWidth, options);
      x += choiceWidth;
    }
    fields.push({ key: 'purpose', rectangle: { x: x - 8, y: 725, width: right - x + 8, height: 12 } });
  } else {
    add('Entity Name:', 'entityName', left, 754, half - 10);
    add('Fund Cluster:', 'fundCluster', left, 730, half - 10);
    add(`${template.toUpperCase()} No.:`, `${template}Number`, left + half, 730, half);
  }
  for (const [key, bounds] of Object.entries(layout.headerBounds)) fields.push({ key, rectangle: bounds, cellBounds: bounds.cellBounds });
  return drawTemplateHeaders(page, fonts.regular, template, valueFor, options, fields);
}

function fieldCaption(key) {
  return captions[key] || key.replace(/([A-Z])/g, ' $1').replace(/\d+$/, '').replace(/^./, letter => letter.toUpperCase());
}

// Short official header boxes cannot grow through adjacent captions. Preserve
// overflow on a labeled A4 information sheet, instead of clipping or reducing
// the font. A visible ellipsis in the original box points to that full value.
export function drawTemplateHeaders(page, font, template, valueFor, options = {}, fields) {
  const overflow = [];
  for (const { key, rectangle, cellBounds } of fields) {
    if (columns[template].some(column => new RegExp(`^${column}\\d+$`).test(key))) continue;
    if (template === 'iar' && ['complete', 'partial'].includes(key)) continue;
    const signature = isFormSignatoryField(key);
    const value = signature ? signatoryText(valueFor(key)) : valueFor(key);
    if (!value) continue;
    const inset = 1;
    const extraHeight = Math.max(0, font.heightAtSize(FORM_PDF_FONT_SIZE) - rectangle.height);
    const bounds = { ...rectangle, x: rectangle.x + inset, width: rectangle.width - inset - 1, y: rectangle.y - extraHeight / 2, height: rectangle.height + extraHeight };
    const lines = wrapTemplateText(value, font, bounds.width);
    let printed = lines[0];
    if (lines.length > 1) {
      overflow.push({ key, caption: fieldCaption(key), value });
      while (printed && font.widthOfTextAtSize(`${printed}…`, FORM_PDF_FONT_SIZE) > bounds.width) printed = printed.slice(0, -1);
      printed += '…';
    }
    drawValue(page, font, printed, bounds, { ...options, cellBounds, section: key }, signature ? 'center' : monetary.has(key) ? 'right' : 'left');
  }
  return overflow;
}

export async function appendTemplateInformation(output, entries, title, documentNumber, fontsFor, options = {}) {
  if (!entries.length) return;
  const fonts = await fontsFor(output);
  const width = FORM_PDF_A4_PORTRAIT[0] - FORM_PDF_MARGIN * 2;
  let page;
  let top = 0;
  const nextPage = () => {
    page = output.addPage(FORM_PDF_A4_PORTRAIT);
    top = FORM_PDF_A4_PORTRAIT[1] - FORM_PDF_MARGIN;
    for (const heading of [`${title} — Additional Information`, documentNumber ? `Document No.: ${documentNumber}` : '', 'Full values for fields marked with an ellipsis in the form.'].filter(Boolean)) {
      for (const line of wrapTemplateText(heading, fonts.regular, width)) {
        drawValue(page, fonts.regular, line, { x: FORM_PDF_MARGIN, y: top - lineHeight, width, height: lineHeight }, { ...options, page: output.getPageCount() - 1, section: 'information heading' });
        top -= lineHeight;
      }
    }
    top -= lineHeight;
  };
  nextPage();
  for (const entry of entries) {
    const lines = wrapTemplateText(entry.value, fonts.regular, width);
    if (top - lineHeight * Math.min(lines.length + 2, 6) < FORM_PDF_MARGIN) nextPage();
    const signature = isFormSignatoryField(entry.key);
    drawValue(page, fonts.bold, `${signature ? entry.caption.toUpperCase() : entry.caption}:`, { x: FORM_PDF_MARGIN, y: top - lineHeight, width, height: lineHeight }, { ...options, page: output.getPageCount() - 1, section: entry.key }, signature ? 'center' : 'left');
    top -= lineHeight;
    for (const line of lines) {
      if (top - lineHeight < FORM_PDF_MARGIN) nextPage();
      drawValue(page, fonts.regular, line, { x: FORM_PDF_MARGIN, y: top - lineHeight, width, height: lineHeight }, { ...options, page: output.getPageCount() - 1, section: entry.key }, signature ? 'center' : 'left');
      top -= lineHeight;
    }
    top -= lineHeight;
  }
}
