import { useEffect, useRef, useSyncExternalStore } from 'react';
import axios from 'axios';

let snapshot = { data: null, error: '' };
let pending;
const listeners = new Set();
const publish = next => { snapshot = next; listeners.forEach(listener => listener()); };
export function refreshFormSignatories() {
  if (pending) return pending;
  pending = axios.get('/settings/form-signatories').then(({ data }) => publish({ data: data.data.signatories || {}, error: '' }))
    .catch(() => publish({ ...snapshot, error: 'Unable to load signatories from System Settings.' }))
    .finally(() => { pending = null; });
  return pending;
}
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refreshFormSignatories();
    window.addEventListener('focus', refreshFormSignatories);
    window.addEventListener('form-signatories-updated', refreshFormSignatories);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { window.removeEventListener('focus', refreshFormSignatories); window.removeEventListener('form-signatories-updated', refreshFormSignatories); }
  };
}
const getSnapshot = () => snapshot;
export default function SignatoryValue({ formType, role, field = 'name', value = '', onChange, managed = false, className = '', 'aria-label': label }) {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const change = useRef(onChange); change.current = onChange;
  const configured = state.data?.[formType]?.[role]?.[field === 'position' ? 'designation' : field];
  useEffect(() => {
    if (managed && configured !== undefined && value !== configured) change.current?.({ target: { value: configured } });
  }, [managed, configured, value]);
  return <div className="min-w-0">
    <p aria-label={label} className={`signatory-value min-h-9 whitespace-pre-wrap break-words border-b border-slate-300 px-1 py-2 text-sm ${className.includes('text-center') ? 'text-center' : ''}`}>{value || ''}</p>
    {managed && state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}
  </div>;
}
