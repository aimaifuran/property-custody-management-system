import { createRisRow, risStockNumber } from './risItemSelection.js';
import { formatItemText } from './capitalizeFormText.js';

export function matchingIarDraftIds(row, drafts) {
  const id = value => String(value?._id || value || '');
  return drafts.filter(draft => {
    if (row.inventory) return [draft.inventory, ...(draft.inventories || [])].some(value => id(value) && id(value) === id(row.inventory));
    if (row.property) return id(draft.property) && id(draft.property) === id(row.property);
    return Boolean(row.stockNumber) && row.stockNumber === (draft.stockNumber || draft.stockPropertyNumber);
  }).map(draft => draft._id);
}

export function iarRequisitionRows(drafts, stocks) {
  const used = new Map();
  const rows = drafts.map(draft => {
    const stock = stocks.find(entry => entry.stockNumber === (draft.stockNumber || draft.stockPropertyNumber));
    if (!stock) throw new Error('A selected item is no longer available. Refresh the list.');
    const available = Math.max(0, Number(stock.quantityOnHand || 0) - (used.get(stock.stockNumber) || 0));
    const quantity = Math.min(Number(draft.acceptedQuantity ?? draft.quantity ?? 0), available);
    if (quantity <= 0) throw new Error('A selected item has no available stock. Refresh the list.');
    used.set(stock.stockNumber, (used.get(stock.stockNumber) || 0) + quantity);
    const cost = draft.unitCost ?? stock.cost ?? '';
    return {
      ...createRisRow(),
      itemName: draft.propertyPlantAndEquipment || stock.name || (stock.category !== 'General' ? stock.category : '') || draft.description || draft.item || '',
      inventory: draft.inventory?._id || draft.inventory,
      property: draft.property?._id || draft.property,
      serialNumber: formatItemText('serialNumber', draft.serialNumber || ''),
      stockNumber: stock.stockNumber, displayStockNumber: risStockNumber(draft),
      description: formatItemText('description', draft.description || draft.item || stock.description || ''),
      unit: formatItemText('unit', draft.unit || stock.unit || ''),
      fundCluster: draft.fundCluster || stock.fundCluster || '',
      responsibilityCenterCode: draft.responsibilityCenterCode || stock.responsibilityCenterCode || '',
      quantityRequested: quantity, quantityIssued: quantity, stockAvailable: available,
      isAvailable: true, unitCost: cost, totalCost: Number(cost || 0) * quantity,
    };
  });
  if (new Set(rows.map(row => row.fundCluster).filter(Boolean)).size > 1) throw new Error('Select items from the same Fund Cluster for one RIS.');
  if (new Set(rows.map(row => row.responsibilityCenterCode).filter(Boolean)).size > 1) throw new Error('Select items from the same Responsibility Center Code for one RIS.');
  return rows;
}
