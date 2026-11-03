export function capitalizeFirstLetter(value) {
  return value.replace(/^(\s*)(\p{L})/u, (_, space, letter) => space + letter.toLocaleUpperCase());
}

export function formatItemText(key, value) {
  if (typeof value !== 'string') return value;
  if (['serialNumber', 'unit', 'purpose'].includes(key)) return value.toUpperCase();
  if (key === 'description') return value.replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toLocaleUpperCase());
  return value;
}

export function shouldCapitalizeField({ type = 'text', hint = '', tagName = 'INPUT', disabled = false, readOnly = false }) {
  if (disabled || readOnly || !['INPUT', 'TEXTAREA'].includes(tagName)) return false;
  if (tagName === 'INPUT' && type !== 'text') return false;
  return !/serial|\bs\/n\b|password|username|email|url|\bcode\b|\bnumber\b|\bno\.?\b|phone|telephone|contact|search|filter|reference|\bid\b/i.test(hint);
}

export function capitalizeFormInput(event) {
  const field = event.target;
  // Restrict this behavior to the signed-in application, leaving credentials alone.
  if (!field.closest?.('.app-shell') || event.nativeEvent?.isComposing || event.isComposing) return;
  const cell = field.closest('td');
  const heading = cell?.closest('table')?.querySelector('thead tr')?.children[cell.cellIndex]?.textContent || '';
  const hint = [field.name, field.id, field.getAttribute('aria-label'), field.placeholder,
    field.labels?.[0]?.textContent, heading].filter(Boolean).join(' ');
  if (field.disabled || field.readOnly || !['INPUT', 'TEXTAREA'].includes(field.tagName) || (field.tagName === 'INPUT' && field.type !== 'text')) return;
  if (/search|filter/i.test(hint)) return;
  const itemKey = /serial|\bs\/n\b/i.test(hint) ? 'serialNumber'
    : /\bunit\b/i.test(hint) && !/cost|price|value|government|entity/i.test(hint) ? 'unit'
    : /description/i.test(hint) ? 'description' : null;
  if (!itemKey && !shouldCapitalizeField({ type: field.type || 'text', hint, tagName: field.tagName })) return;
  const value = itemKey ? formatItemText(itemKey, field.value) : capitalizeFirstLetter(field.value);
  if (value === field.value) return;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const direction = field.selectionDirection;
  const delta = value.length - field.value.length;
  // Bypass React's value tracker so the normal onChange receives the new value.
  const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
  if (start !== null) field.setSelectionRange(start + delta, end + delta, direction);
}
