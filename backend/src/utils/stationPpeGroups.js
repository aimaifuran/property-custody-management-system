const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

module.exports = function stationPpeGroups(inventories, accounts, issuedGroups = []) {
  const groups = new Map();
  const byInventory = new Map();
  for (const account of accounts) {
    const key = String(account.inventory);
    const rows = byInventory.get(key) || [];
    if (Number(account.quantity || 0) > Number(account.returnedQuantity || 0)) rows.push(account);
    byInventory.set(key, rows);
  }
  for (const inventory of inventories) {
    const item = inventory.item;
    if (!item || item.deleted) continue;
    const name = item.name?.trim() || (normalize(item.category) !== 'general' && item.category?.trim()) || item.description;
    const key = normalize(name);
    const group = groups.get(key) || { key, name, rows: [] };
    const owners = byInventory.get(String(inventory._id)) || [];
    const base = { article: group.name, description: item.description, propertyNumber: inventory.propertyNumber || item.stockNumber || '', unitCost: '', totalCost: '' };
    const inventorySerial = String(inventory.serialNumber || '').trim();
    for (const owner of owners) {
      const user = owner.user;
      const name = user && typeof user === 'object' ? [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.username : '';
      const serial = String(inventory.serialNumber || owner.serialNumber || '').trim();
      const description = serial ? `${item.description}\nSerial No. ${serial}` : item.description;
      const condition = normalize(owner.condition || inventory.property?.condition);
      const remarks = condition === 'unserviceable' || inventory.status?.includes('UNSERVICEABLE') ? 'Unserviceable'
        : condition === 'new' ? 'New' : condition === 'serviceable' ? 'Serviceable' : 'New';
      group.rows.push({ ...base, description, propertyNumber: owner.propertyNumber || base.propertyNumber, accountablePerson: name || owner.offlineRecipient?.name || owner.employee || '', remarks });
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
        unitCost: '', totalCost: '', remarks: 'New' });
    }
    if (group.rows.length) groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
};
