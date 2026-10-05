import axios from 'axios';
import toast from 'react-hot-toast';
const keyFor = role => `pams.signatory.${role}`;
let remembered = {};
let queue = Promise.resolve();
export const loadStickySignatories = async () => {
  const { data } = await axios.get('/settings/remembered-signatories');
  remembered = data.data || {};
};
export const getStickySignatory = (role, fallback = {}) => {
  if (fallback.name || fallback.designation || fallback.position) return fallback;
  try {
    const saved = remembered[role] || JSON.parse(window.localStorage.getItem(keyFor(role)) || '{}');
    return { ...fallback, ...Object.fromEntries(Object.entries(saved).filter(([key]) => ['name', 'designation', 'position'].includes(key))) };
  } catch { return fallback; }
};
export const saveStickySignatory = (role, signatory, field) => {
  if (!['name', 'designation', 'position'].includes(field)) return;
  const value = signatory[field];
  remembered[role] = { ...getStickySignatory(role), [field]: value, ...(['position', 'designation'].includes(field) ? { position: value, designation: value } : {}) };
  try { window.localStorage.setItem(keyFor(role), JSON.stringify(remembered[role])); } catch { /* Browser storage is optional. */ }
  queue = queue.catch(() => {}).then(() => axios.patch('/settings/remembered-signatories', { role, field, value }));
  queue.catch(() => toast.error('Unable to remember signatory in the system. Please retry editing the field.'));
};
