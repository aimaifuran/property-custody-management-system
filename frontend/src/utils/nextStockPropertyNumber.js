export function singleStockPropertyNumber(item) {
  return String(item.stockPropertyNumber || '').split(' – ')[0].trim();
}

export function nextStockPropertyNumber(items) {
  const used = new Set(items.map(singleStockPropertyNumber));
  const previous = [...items].reverse().find(item => String(item.stockPropertyNumber || '').trim());
  const last = previous ? singleStockPropertyNumber(previous) : '';
  const match = last.match(/^(.*?)(\d+)$/);
  if (!match) return '';
  const [, prefix, digits] = match;
  let number = BigInt(digits);
  let next;
  do {
    number += 1n;
    next = `${prefix}${String(number).padStart(digits.length, '0')}`;
  } while (used.has(next));
  return next;
}
