export const createRisRow = () => ({ stockNumber: '', unit: '', description: '', quantityRequested: '', isAvailable: null, stockAvailable: '', quantityIssued: '', remarks: '', totalCost: null });
const idOf = value => String(value?._id || value || '');
export function risDraftRows(record) {
  const untouchedReceiptDraft = record.status === 'DRAFT' && record.iar && !record.sourceInventory
    && record.createdAt && record.createdAt === record.updatedAt
    && !record.purpose && !record.requestedBy?.name && !record.requestedBy?.user && !record.requestedBy?.offlineRecipient
    && (record.items || []).every(row => row.quantityIssued == null && !row.remarks);
  return !untouchedReceiptDraft && record.items?.length ? record.items : [createRisRow()];
}
export const risItemName = item => item.name?.trim() || (item.category?.toLowerCase() !== 'general' ? item.category?.trim() : '') || item.description || '';

// One visible choice per item name. Unit IDs/serials remain the identity stored
// on the row; the next available physical unit is allocated only after a click.
export function risItemChoices(stocks, rows, index) {
  const selected = new Set(rows.filter((_, i) => i !== index).map(row => idOf(row.inventory)).filter(Boolean));
  const current = rows[index];
  const otherFunds = new Set(rows.filter((_, i) => i !== index).map(row => row.fundCluster).filter(Boolean));
  const requiredFund = otherFunds.size === 1 ? [...otherFunds][0] : '';
  const groups = new Map();
  for (const stock of stocks) {
    const name = risItemName(stock);
    if (!name || !Number.isFinite(Number(stock.quantityOnHand)) || Number(stock.quantityOnHand) <= 0) continue;
    const key = name.toLowerCase();
    let units = (stock.units || []).filter(unit => !selected.has(idOf(unit)) && (!requiredFund || !(unit.fundCluster || stock.fundCluster) || (unit.fundCluster || stock.fundCluster) === requiredFund));
    const tracked = stock.hasTrackedUnits || stock.units?.length > 0;
    const preferredUnit = units.find(unit => idOf(unit) === idOf(current?.inventory)) || units[0];
    const sourceFund = preferredUnit?.fundCluster || stock.fundCluster || '';
    if (tracked && sourceFund) units = units.filter(unit => (unit.fundCluster || stock.fundCluster || '') === sourceFund);
    if (!tracked && requiredFund && stock.fundCluster && stock.fundCluster !== requiredFund) continue;
    const used = rows.reduce((sum, row, i) => i !== index && row.stockNumber === stock.stockNumber ? sum + Number(row.quantityIssued || row.quantityRequested || 0) : sum, 0);
    const available = tracked ? Math.min(units.length, Math.max(0, Number(stock.quantityOnHand) - used)) : Number(stock.quantityOnHand) - used;
    if (available <= 0) continue;
    const choice = groups.get(key) || { key, name, candidates: [] };
    choice.candidates.push({ stock, unit: units.find(unit => idOf(unit) === idOf(current?.inventory)) || units[0], tracked, available });
    groups.set(key, choice);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function selectRisItem(row, choice) {
  if (!choice) return { ...createRisRow(), remarks: row.remarks || '' };
  const { stock, unit, tracked, available } = choice.candidates[0];
  return { ...row, fundCluster: unit?.fundCluster || stock.fundCluster || '', responsibilityCenterCode: unit?.responsibilityCenterCode || stock.responsibilityCenterCode || '', stockNumber: stock.stockNumber, inventory: unit?._id || '', property: unit?.property,
    serialNumber: unit?.serialNumber || '', itemName: choice.name, unit: stock.unit || '',
    description: stock.description || choice.name, quantityRequested: '',
    quantityIssued: '', stockAvailable: available, isAvailable: true,
    unitCost: unit?.unitCost ?? stock.cost, totalCost: null };
}

export function setRisRequestedQuantity(row, value, available, isUser = false) {
  const requested = Number(value);
  const valid = value !== '' && Number.isInteger(requested) && requested >= 0;
  const knownStock = available !== '' && available != null && Number.isFinite(Number(available));
  return { ...row, quantityRequested: value, stockAvailable: available,
    quantityIssued: !isUser && valid && knownStock ? Math.min(requested, Math.max(0, Number(available))) : '',
    totalCost: null };
}

export function risSelectedFunds(rows, stocks) {
  return [...new Set(rows.filter(row => row.stockNumber).map(row => {
    const stock = stocks.find(stock => stock.stockNumber === row.stockNumber);
    const unit = stock?.units?.find(unit => idOf(unit) === idOf(row.inventory));
    return unit?.fundCluster || row.fundCluster || stock?.fundCluster || '';
  }).filter(Boolean))];
}

export function risSelectedCenters(rows, stocks) {
  return [...new Set(rows.filter(row => row.stockNumber).map(row => {
    const stock = stocks.find(stock => stock.stockNumber === row.stockNumber);
    const unit = stock?.units?.find(unit => idOf(unit) === idOf(row.inventory));
    return unit?.responsibilityCenterCode || row.responsibilityCenterCode || stock?.responsibilityCenterCode || '';
  }).filter(Boolean))];
}
