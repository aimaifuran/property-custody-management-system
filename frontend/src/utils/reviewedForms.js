const memory = new Set();

export const reviewKey = (userId, recordId) => userId && recordId
  ? `pams.reviewed-form.${userId}.${recordId}`
  : null;

export function isFormReviewed(key) {
  if (!key) return false;
  try { return memory.has(key) || localStorage.getItem(key) === '1'; }
  catch { return memory.has(key); }
}

export function markFormReviewed(key) {
  if (!key) return;
  memory.add(key);
  try { localStorage.setItem(key, '1'); } catch { /* Retain it for this session when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent('pams:form-reviewed', { detail: key }));
}
