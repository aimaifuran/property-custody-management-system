import { rgb } from 'pdf-lib';
import { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';

export const REPORT_LINE_HEIGHT = FORM_PDF_FONT_SIZE + 3;
export const REPORT_CELL_PADDING = 6;
export const cleanReportText = value => String(value ?? '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-')
  .replace(/[^\x20-\x7e\n]/g, '?');

export function wrapReportText(value, available, font) {
  const lines = [];
  for (const paragraph of cleanReportText(value).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (line && font.widthOfTextAtSize(`${line} ${word}`, FORM_PDF_FONT_SIZE) > available) {
        lines.push(line);
        line = '';
      }
      for (const character of `${line ? ' ' : ''}${word}`) {
        if (line && font.widthOfTextAtSize(line + character, FORM_PDF_FONT_SIZE) > available) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function drawReportLines(page, lines, x, top, width, font, { align = 'left', padding = 4, height, verticalAlign = 'top', color = rgb(0, 0, 0), onDraw } = {}) {
  const ascent = font.heightAtSize(FORM_PDF_FONT_SIZE, { descender: false });
  const descent = font.heightAtSize(FORM_PDF_FONT_SIZE) - ascent;
  const blockHeight = ascent + descent + Math.max(0, lines.length - 1) * REPORT_LINE_HEIGHT;
  const verticalOffset = height && verticalAlign === 'center' ? Math.max(0, (height - 2 * padding - blockHeight) / 2) : 0;
  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, FORM_PDF_FONT_SIZE);
    const lineX = align === 'center' ? x + (width - lineWidth) / 2 : align === 'right' ? x + width - padding - lineWidth : x + padding;
    const baseline = top - padding - verticalOffset - ascent - index * REPORT_LINE_HEIGHT;
    page.drawText(line, { x: lineX, y: baseline, font, size: FORM_PDF_FONT_SIZE, color });
    onDraw?.({ text: line, x: lineX, y: baseline - descent, width: lineWidth, height: ascent + descent });
  });
  return lines.length * REPORT_LINE_HEIGHT + padding * 2;
}

export function reportColumns(definitions, left, width) {
  let x = left;
  return definitions.map(([key, label, percent, align]) => {
    align ||= ['quantity', 'unitCost', 'totalCost', 'amount'].includes(key) ? 'right'
      : ['item', 'description', 'office', 'custodian', 'accountablePerson', 'remarks', 'entityName'].includes(key) ? 'left' : 'center';
    const column = { label, x, width: width * percent / 100, align };
    x += column.width;
    return column;
  });
}

export function drawReportGridHeader(layout, columns, font) {
  const lines = columns.map(column => wrapReportText(column.label, column.width - 2 * REPORT_CELL_PADDING, font));
  const height = Math.max(...lines.map(cell => cell.length)) * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING;
  drawReportGridSegment(layout, columns, lines, height, font, true);
  return height;
}

function drawReportGridSegment(layout, columns, lines, height, font, header = false) {
  columns.forEach((column, index) => {
    layout.page.drawRectangle({ x: column.x, y: layout.y - height, width: column.width, height, borderWidth: .65, borderColor: rgb(0, 0, 0) });
    const cell = { kind: 'cell', header, column: index, page: layout.page, x: column.x, y: layout.y - height, width: column.width, height, padding: REPORT_CELL_PADDING, align: header ? 'center' : column.align };
    layout.onDraw?.(cell);
    drawReportLines(layout.page, lines[index], column.x, layout.y, column.width, font, {
      align: cell.align, padding: REPORT_CELL_PADDING, height, verticalAlign: 'center',
      onDraw: text => layout.onDraw?.({ kind: 'cellText', cell, ...text }),
    });
  });
  layout.y -= height;
}

// Keep the font readable and continue oversized cells instead of clipping them.
export function drawReportGridRow(layout, columns, values, font, newPage, minimumHeight = 24) {
  const remaining = values.map((value, index) => wrapReportText(value, columns[index].width - 2 * REPORT_CELL_PADDING, font));
  let lineCount = Math.max(...remaining.map(lines => lines.length));
  while (lineCount > 0) {
    let height = Math.max(minimumHeight, lineCount * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING);
    const fullPageCapacity = layout.rowCapacity;
    if (height <= fullPageCapacity && layout.y - height < layout.bottom) newPage();
    let fit = Math.floor((layout.y - layout.bottom - 2 * REPORT_CELL_PADDING) / REPORT_LINE_HEIGHT);
    if (fit < 1 || layout.y - minimumHeight < layout.bottom) {
      newPage();
      fit = Math.floor((layout.y - layout.bottom - 2 * REPORT_CELL_PADDING) / REPORT_LINE_HEIGHT);
    }
    if (fit < 1 || layout.y - minimumHeight < layout.bottom) throw new Error('The report header leaves no space for its rows. Shorten its header fields.');
    const count = Math.min(lineCount, fit);
    height = Math.max(minimumHeight, count * REPORT_LINE_HEIGHT + 2 * REPORT_CELL_PADDING);
    drawReportGridSegment(layout, columns, remaining.map(lines => lines.splice(0, count)), height, font);
    lineCount = Math.max(...remaining.map(lines => lines.length));
    if (lineCount > 0) newPage();
  }
}
