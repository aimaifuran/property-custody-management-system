export function displayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '';
}

export function parseDisplayDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, month, day, year] = match;
  if (Number(year) < 1) return null;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : null;
}
