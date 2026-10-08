import { buildRisPdf } from './risPdf.js';
import { buildPtrPdf } from './ptrPdf.js';
export { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';
import { FORM_PDF_A4_LANDSCAPE, FORM_PDF_A4_PORTRAIT } from './formPdfStyle.js';
import { embedFormFonts } from './formPdfFonts.js';
import { appendTemplateInformation, drawStandardFormHeaders, drawTemplateRows, drawTemplateTableFrame, paginateTemplateItems, templateRowLayout } from './templatePdfLayout.js';
import { PDFDocument } from 'pdf-lib';

export const FORM_TEMPLATES = { IAR: 'iar', 'PROPERTY CARD': 'pc', RIS: 'ris', ICS: 'ics', PAR: 'par', PTR: 'ptr', PRS: 'prs', 'RETURNED SUPPLY': 'prs' };
const dateText = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH');
};
const text = value => value == null ? '' : typeof value === 'object' ? value.name || '' : String(value);
const amountFields = new Set(['amount', 'unitCost', 'totalCost', 'totalAmount', 'unitValue', 'totalValue']);

export function templateFieldValue(name, data, items) {
  const match = name.match(/^(.*?)(\d+)$/);
  let key = name;
  let source = data;
  if (match && !name.startsWith('returnedTo')) {
    key = match[1]; source = items[Number(match[2]) - 1];
    if (!source) return '';
    if (key === 'yes' || key === 'no') return source.isAvailable == null ? '' : (key === 'yes' ? source.isAvailable : !source.isAvailable) ? '/' : '';
    if (key === 'endUser') return text(source.endUser || data.returnedBy);
    if (key === 'quantityIssued' && Number(source.quantityIssued) <= 0) return '';
  }
  const person = key.match(/^(requestedBy|approvedBy|issuedBy|receivedBy|receivedFrom|returnedBy|returnedTo)(Name|Designation|Position|Date)(?:\d)?$/);
  if (person) {
    const value = data[person[1]];
    const field = person[2].toLowerCase();
    return field === 'date' ? dateText(value?.date) : field === 'name' ? text(value) : text(value?.[field] || value?.designation || value?.position);
  }
  const aliases = { reqOffice: 'requisitioningOffice', rcc: 'responsibilityCenterCode' };
  const checkmarks = { complete: ['acceptanceStatus', 'Complete'], partial: ['acceptanceStatus', 'Partial'], donation: ['transferType', 'Donation'], reassignment: ['transferType', 'Reassignment'], relocate: ['transferType', 'Relocate'], disposal: ['purpose', 'Disposal'], repair: ['purpose', 'Repair'], returnedToStock: ['purpose', 'Returned To Stock'] };
  if (checkmarks[key]) { const [field, value] = checkmarks[key]; return data[field] === value ? '/' : ''; }
  const isTransfer = data._template === 'ptr' || Boolean(data.ptrNumber);
  const isReturn = data._template === 'prs' || Boolean(data.prsNumber);
  const standardChoices = isTransfer ? ['Donation', 'Reassignment', 'Relocate'] : ['Disposal', 'Repair', 'Returned To Stock'];
  if (key === 'other') return data[isTransfer ? 'transferType' : 'purpose'] && !standardChoices.includes(data[isTransfer ? 'transferType' : 'purpose']) ? '/' : '';
  if ((key === 'transferType' || key === 'purpose' && isReturn) && standardChoices.includes(data[key])) return '';
  let value = source[aliases[key] || key];
  if (key === 'stockNumber') value ??= source.stock_number ?? source.stockPropertyNumber;
  if (key === 'description') value ??= source.itemName ?? source.item;
  if (key === 'supplierName') value ??= data.supplier?.name;
  if (key === 'acceptedBy') value ??= data.custodian ?? data.receivedBy;
  if (key === 'totalAmount' && value == null && data.totalValue != null) value = data.totalValue;
  if (key === 'totalAmount' && value == null && data.items?.length) value = data.items.reduce((sum, item) => sum + Number(item.totalCost ?? item.totalValue ?? item.amount ?? 0), 0);
  if (key.toLowerCase().includes('date') || key === 'month') return dateText(value);
  if (amountFields.has(key) && value != null && value !== '') return Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return text(value);
}

// Draw the official sections once per page in one document. Reopening, flattening
// and copying native templates for every page needlessly delayed print previews.
export async function buildHistoricalFormPdf(record, _loadTemplate, options = {}) {
  if (record.type === 'RIS') return buildRisPdf(record.details || {}, options);
  if (record.type === 'PTR') return buildPtrPdf(record.details || {}, options);
  const template = FORM_TEMPLATES[record.type];
  if (!template) throw new Error('No PDF template is available for this record type');
  const data = { ...(record.details || {}), _template: template };
  const items = Array.isArray(data.items) ? data.items : record.type === 'RETURNED SUPPLY' ? [data] : [];
  const output = await PDFDocument.create();
  const fonts = await embedFormFonts(output, ['regular', 'bold']);
  const layout = templateRowLayout(template, fonts.bold);
  const itemOverflow = [];
  const itemPages = paginateTemplateItems(items, layout, fonts.regular, (key, item) => templateFieldValue(`${key}1`, data, [item]), { onOverflow: entry => itemOverflow.push(entry) });
  let overflow = [];
  for (const [pageIndex, rows] of itemPages.entries()) {
    const page = output.addPage(template === 'pc' ? FORM_PDF_A4_LANDSCAPE : FORM_PDF_A4_PORTRAIT);
    drawTemplateTableFrame(page, fonts, rows, layout, { ...options, page: pageIndex });
    const headerOverflow = drawStandardFormHeaders(page, fonts, layout, key => templateFieldValue(key, data, []), data, { ...options, page: pageIndex });
    if (pageIndex === 0) overflow = [...headerOverflow, ...itemOverflow];
    drawTemplateRows(page, fonts.regular, rows, layout, { ...options, page: pageIndex });
  }
  const number = data.iarNumber || data.icsNumber || data.parNumber || data.prsNumber || data.propertyNumber;
  await appendTemplateInformation(output, overflow, record.type, number, async () => fonts, options);
  return output.save();
}
