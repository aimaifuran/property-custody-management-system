const { lineAmount } = require('./formAmounts');
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const eventTime = value => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

module.exports = function stationPpeGroups(inventories, accounts, issuedGroups = [], returnedSlips = []) {
  const groups = new Map();
  const byInventory = new Map();
  for (const account of accounts) {
    const key = String(account.inventory);
    const rows = byInventory.get(key) || [];
    if (Number(account.quantity || 0) > Number(account.returnedQuantity || 0)) rows.push(account);
    byInventory.set(key, rows);
  }
  for (const inventory of inventories) {
    const iar = inventory.inspectionAcceptanceReport;
    if (iar && typeof iar === 'object' && Array.isArray(iar.items)) {
      const inventoryId = String(inventory._id);
      const receiptLine = iar.items.find(entry => String(entry.inventory?._id || entry.inventory || '') === inventoryId
        || (entry.inventories || []).some(id => String(id?._id || id) === inventoryId));
      if (!receiptLine || !(receiptLine.isPpe ?? Boolean(String(receiptLine.inventoryItemNo || '').trim()))) continue;
    }
    const item = inventory.item;
    if (!item || item.deleted) continue;
    const name = item.name?.trim() || (normalize(item.category) !== 'general' && item.category?.trim()) || item.description;
    const key = normalize(name);
    const group = groups.get(key) || { key, name, rows: [] };
    const owners = byInventory.get(String(inventory._id)) || [];
    const base = { article: group.name, description: item.description, propertyNumber: inventory.propertyNumber || item.stockNumber || '', unitCost: inventory.unitCost ?? '', totalCost: '' };
    const inventorySerial = String(inventory.serialNumber || '').trim();
    for (const owner of owners) {
      const user = owner.user;
      const name = user && typeof user === 'object' ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.username : '';
      const serial = String(inventory.serialNumber || owner.serialNumber || '').trim();
      const description = serial ? `${item.description}\nSerial No. ${serial}` : item.description;
      const condition = normalize(owner.condition || inventory.property?.condition);
      if (condition === 'unserviceable' || inventory.status?.includes('UNSERVICEABLE')) continue;
      const remarks = condition === 'new' ? 'New' : condition === 'serviceable' ? 'Serviceable' : 'New';
      const transferDate = owner.transferHistory?.[owner.transferHistory.length - 1]?.date;
      group.rows.push({ ...base, totalCost: base.unitCost === '' ? '' : lineAmount(Number(owner.quantity || 0) - Number(owner.returnedQuantity || 0), base.unitCost), description, propertyNumber: owner.propertyNumber || base.propertyNumber, accountablePerson: name || owner.offlineRecipient?.name || owner.employee || '', remarks, _lastHeldAt: eventTime(owner.acceptedAt || transferDate || owner.issueDate), _sourceRank: 2 });
    }
    if (group.rows.length) groups.set(key, group);
  }
  for (const issued of issuedGroups.filter(group => group.classification === 'SUPPLY')) {
    const key = normalize(issued.name);
    const group = groups.get(key) || { key, name: issued.name, rows: [] };
    for (const holder of issued.holders) for (const unit of holder.units) {
      if (!(unit.quantity > 0)) continue;
      const serial = String(unit.serialNumber || '').trim();
      const description = unit.description || issued.name;
      group.rows.push({ article: group.name, description: serial ? `${description}\nSerial No. ${serial}` : description,
        propertyNumber: unit.propertyNumber || unit.stockNumber || '', accountablePerson: holder.name,
        unitCost: unit.unitCost ?? '', totalCost: unit.unitCost == null ? '' : lineAmount(unit.quantity, unit.unitCost), remarks: 'New', _lastHeldAt: eventTime(unit.issuedAt), _sourceRank: 2 });
    }
    if (group.rows.length) groups.set(key, group);
  }
  for (const slip of returnedSlips) for (const entry of slip.items || []) {
    const unserviceable = /disposal|repair/i.test(String(slip.purpose || ''));
    const accountability = entry.accountability;
    const inventory = accountability?.inventory;
    const item = inventory?.item;
    const article = item?.name?.trim() || (normalize(item?.category) !== 'general' && item?.category?.trim()) || item?.description || entry.description?.trim() || 'Returned PPE';
    const key = normalize(article);
    const group = groups.get(key) || { key, name: article, rows: [] };
    const serial = String(accountability?.serialNumber || inventory?.serialNumber || '').trim();
    const description = entry.description || item?.description || article;
    const unitCost = entry.unitValue ?? inventory?.unitCost ?? '';
    group.rows.push({
      article: group.name,
      description: serial ? `${description}\nSerial No. ${serial}` : description,
      propertyNumber: entry.propertyNumber || inventory?.propertyNumber || accountability?.propertyNumber || '',
      accountablePerson: slip.returnedBy?.name || '',
      unitCost,
      totalCost: entry.totalValue ?? (unitCost === '' ? '' : lineAmount(Number(entry.quantity || 0), unitCost)),
      remarks: unserviceable ? 'Unserviceable' : 'Serviceable',
      _lastHeldAt: eventTime(slip.returnedTo?.date || slip.returnedAt || slip.createdAt),
      _sourceRank: 1,
    });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const latestByProperty = new Map();
    const unidentified = [];
    for (const row of group.rows) {
      const identity = normalize(row.propertyNumber);
      if (!identity) { unidentified.push(row); continue; }
      const current = latestByProperty.get(identity);
      if (!current || row._lastHeldAt > current._lastHeldAt || (row._lastHeldAt === current._lastHeldAt && row._sourceRank > current._sourceRank)) latestByProperty.set(identity, row);
    }
    group.rows = [...latestByProperty.values(), ...unidentified].map(({ _lastHeldAt, _sourceRank, ...row }) => row);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
};
