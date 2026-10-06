import { buildRisPdf } from './risPdf.js';
import { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';
export { FORM_PDF_FONT_SIZE } from './formPdfStyle.js';
import { embedFormFonts } from './formPdfFonts.js';
import { useTimesNewRomanInTemplate } from './templatePdfFonts.js';
import { PDFDocument, PDFTextField, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

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
  if (key === 'totalAmount' && value == null && data.totalValue != null) value = data.totalValue;
  if (key === 'totalAmount' && value == null && data.items?.length) value = data.items.reduce((sum, item) => sum + Number(item.totalCost ?? item.totalValue ?? item.amount ?? 0), 0);
  if (key.toLowerCase().includes('date') || key === 'month') return dateText(value);
  if (amountFields.has(key) && value != null && value !== '') return Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return text(value);
}

function normalizeTemplateFonts(document) {
  for (const [reference, object] of document.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      let content;
      try { content = Array.from(decodePDFRawStream(object).decode(), byte => String.fromCharCode(byte)).join(''); } catch { continue; }
      if (!/\/[^\s]+\s+[\d.]+\s+Tf\b/.test(content)) continue;
      const normalized = content.replace(/(\/[^\s]+\s+)[\d.]+(\s+Tf\b)/g, `$1${FORM_PDF_FONT_SIZE}$2`);
      const dictionary = object.dict.clone(document.context);
      dictionary.delete(document.context.obj('Filter'));
      dictionary.delete(document.context.obj('DecodeParms'));
      const bytes = Uint8Array.from(normalized, character => character.charCodeAt(0));
      document.context.assign(reference, document.context.flateStream(bytes, Object.fromEntries(dictionary.entries().filter(([key]) => key.toString() !== '/Length').map(([key, value]) => [key.decodeText(), value]))));
    }
}

// Reuse the official form assets; render every row, including continuation pages.
export async function buildHistoricalFormPdf(record, loadTemplate = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Unable to load the official PDF template');
  return response.arrayBuffer();
}) {
  if (record.type === 'RIS') return buildRisPdf(record.details || {});
  const template = FORM_TEMPLATES[record.type];
  if (!template) throw new Error('No PDF template is available for this record type');
  const data = { ...(record.details || {}), _template: template };
  const items = Array.isArray(data.items) ? data.items : record.type === 'RETURNED SUPPLY' ? [data] : [];
  const templateBytes = await loadTemplate(`/forms/templates/${template}-template.pdf`);
  const sample = await PDFDocument.load(templateBytes);
  const rowNumbers = sample.getForm().getFields().map(field => field.getName().match(/^(?:quantity|date|stockNumber|description)\d+$/)?.[0]).filter(Boolean).map(name => Number(name.match(/\d+$/)[0]));
  const capacity = Math.max(1, ...rowNumbers);
  const output = await PDFDocument.create();
  for (let offset = 0; offset < Math.max(1, items.length); offset += capacity) {
    const document = await PDFDocument.load(templateBytes);
    const fonts = await embedFormFonts(document);
    useTimesNewRomanInTemplate(document, fonts);
    normalizeTemplateFonts(document);
    const form = document.getForm();
    for (const field of form.getFields()) {
      if (field instanceof PDFTextField) { field.setText(templateFieldValue(field.getName(), data, items.slice(offset, offset + capacity))); field.setFontSize(FORM_PDF_FONT_SIZE); }
    }
    form.updateFieldAppearances(fonts.regular);
    form.flatten({ updateFieldAppearances: false });
    const pages = await output.copyPages(document, document.getPageIndices());
    pages.forEach(page => output.addPage(page));
  }
  // Flattening can generate additional appearance streams. Normalize the saved
  // document too so both static captions and field text have one fixed size.
  const finalDocument = await PDFDocument.load(await output.save());
  normalizeTemplateFonts(finalDocument);
  return finalDocument.save();
}
