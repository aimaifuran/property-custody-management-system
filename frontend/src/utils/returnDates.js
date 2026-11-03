export function confirmedReturnDates(entries = []) {
  const dates = entries.filter(entry => entry.status === 'RETURNED' && entry.date)
    .map(entry => new Date(entry.date)).filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b)
    .map(date => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', year: 'numeric' }).format(date));
  return [...new Set(dates)].join(', ');
}
