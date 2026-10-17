// Calendar date in the office timezone, including before UTC midnight.
export function todayManila(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Apply only when creating a form; saved records retain their original dates.
export function withCurrentDates(value, today = todayManila()) {
  if (Array.isArray(value)) return value.map(item => withCurrentDates(item, today));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
    (key === 'date' || key === 'dateAcquired' || key.endsWith('Date')) && (field === '' || field == null)
      ? today : withCurrentDates(field, today),
  ]));
}
