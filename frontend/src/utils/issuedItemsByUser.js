export function groupIssuedItemsByUser(items, accounts = []) {
  const users = new Map(accounts.map(account => {
    const id = `user:${account._id}`;
    return [id, { id, name: [account.firstName, account.middleName, account.lastName].filter(Boolean).join(' ') || account.username, office: account.office || '', quantity: 0, items: [] }];
  }));
  for (const item of items) for (const holder of item.holders || []) {
    const user = users.get(holder.id) || { id: holder.id, name: holder.name, office: holder.office, quantity: 0, items: [] };
    user.quantity += holder.quantity;
    user.items.push({ ...item, holders: undefined, quantity: holder.quantity, units: holder.units });
    users.set(holder.id, user);
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// A single item/holder can have issuances charged to different funds.
export function filterIssuedItemsByFund(items, fund) {
  if (!fund) return items;
  return items.map(item => {
    const holders = item.holders.map(holder => {
      const units = holder.units.filter(unit => unit.fundCluster === fund);
      return { ...holder, units, quantity: units.reduce((sum, unit) => sum + unit.quantity, 0) };
    }).filter(holder => holder.quantity > 0);
    return { ...item, holders, quantity: holders.reduce((sum, holder) => sum + holder.quantity, 0) };
  }).filter(item => item.quantity > 0);
}
