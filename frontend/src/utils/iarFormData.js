import { todayManila } from './formDates.js';
import { createRisRow } from './risItemSelection.js';
const inputDate = value => value ? String(value).slice(0, 10) : '';

// Copy only fields with the same meaning; never reuse another document's number.
export function iarFormData(report, type) {
  const date = inputDate(report.acceptanceDate || report.iarDate || report.poDate) || todayManila();
  const items = (report.items || []).filter(item => (item.acceptedQuantity ?? item.quantity) > 0).map(item => {
    const description = item.description || item.item || '';
    const propertyNumber = item.propertyNumber || item.stockPropertyNumber || item.stockNumber || '';
    const quantity = item.acceptedQuantity ?? item.quantity ?? '';
    const unitCost = item.unitCost ?? '';
    const amount = Number(quantity || 0) * Number(unitCost || 0);
    const identity = { inventory: item.inventory, property: item.property, serialNumber: item.serialNumber || '' };
    const common = { ...identity, description: item.serialNumber ? `${description} (S/N: ${item.serialNumber})` : description, unit: item.unit || '', quantity, unitCost };
    if (type === 'inventory') return { ...identity, description, propertyNumber, serialNumber: item.serialNumber || '', date, referenceParNo: '', receiptQuantity: quantity, itdQuantity: '', itdOfficeOfficer: '', balanceQuantity: '', amount: unitCost === '' ? '' : amount, remarks: '' };
    if (type === 'ris') return { inventory: item.inventory, property: item.property, serialNumber: item.serialNumber || '', stockNumber: item.stockNumber || item.stockPropertyNumber || '', unit: common.unit, description, quantityRequested: quantity, stockAvailable: '', isAvailable: null, quantityIssued: '', unitCost, totalCost: amount, remarks: '' };
    if (type === 'ics') return { ...common, inventoryItemNo: propertyNumber, totalCost: amount, estimatedUsefulLife: item.estimatedUsefulLife || '' };
    if (type === 'par') return { ...common, propertyNumber, dateAcquired: date, amount };
    if (type === 'ptr') return {
      ...identity,
      itemName: item.propertyPlantAndEquipment || item.inventory?.item?.name ||
        (item.inventory?.item?.category !== 'General' ? item.inventory?.item?.category : '') || '',
      description: common.description,
      propertyNumber,
      dateAcquired: date,
      amount,
      condition: '',
    };
    return { ...identity, description: common.description, propertyNumber, dateAcquired: date, amount, condition: '' };
  });
  const result = { iar: report._id, fundCluster: report.fundCluster || '', items };
  if (type === 'inventory') Object.assign(result, { propertyPlantAndEquipment: [...new Set((report.items || []).map(item => item.propertyPlantAndEquipment).filter(Boolean))].join('; '), poNumber: report.poNumber || '', month: inputDate(report.iarDate).slice(0, 7), description: items.map(item => item.description).filter(Boolean).join('; '), propertyNumber: items[0]?.propertyNumber || '', serialNumber: [...new Set(items.map(item => item.serialNumber).filter(Boolean))].join('; ') });
  if (type === 'ris') Object.assign(result, { responsibilityCenterCode: report.responsibilityCenterCode || '', date, items: [createRisRow()] });
  return result;
}
