import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import Skeleton from './Skeleton';

const cacheKey = 'pams.entityName';
const readCachedName = () => {
  try { return localStorage.getItem(cacheKey) || ''; } catch { return ''; }
};
const cacheName = name => {
  try { localStorage.setItem(cacheKey, name); } catch { /* Database remains the source of truth. */ }
};

export default function EntityNameField({ value = '', onChange, isNew = true }) {
  const { user } = useAuth();
  const [globalName, setGlobalName] = useState(readCachedName);
  const [loading, setLoading] = useState(() => !readCachedName());
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === 'admin' || user?.permissions?.includes('canManageSettings');
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const { data } = await axios.get('/settings/entity-name', { signal: controller.signal });
        const name = data.data.entityName || '';
        cacheName(name); setGlobalName(name); setError('');
      } catch { if (!controller.signal.aborted) setError('Unable to load Entity Name. Refresh to retry.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    load();
    window.addEventListener('entity-name-updated', load);
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('entity-name-updated', load); window.removeEventListener('focus', load); };
  }, []);
  useEffect(() => {
    if (!dirty && !loading && !error && isNew && globalName && value !== globalName) change.current(globalName);
  }, [globalName, value, isNew, loading, error, dirty]);
  const save = async () => {
    if (!dirty || saving || !canEdit) return;
    if (!draft.trim()) {
      setError('Entity Name cannot be blank.');
      return;
    }
    if (draft.trim() === globalName) { setDirty(false); setError(''); return; }
    setSaving(true);
    try {
      const { data } = await axios.patch('/settings/entity-name', { entityName: draft });
      cacheName(data.data.entityName);
      setGlobalName(data.data.entityName); change.current(data.data.entityName); setDirty(false); setError('');
      window.dispatchEvent(new Event('entity-name-updated'));
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to save Entity Name. Leave the field again to retry.';
      setError(message); toast.error(message);
    }
    finally { setSaving(false); }
  };
  return <div className="entity-name-field min-w-0">
    <label className="block"><span className="mb-1 block font-semibold">Entity Name:</span>
      {loading && !value ? <Skeleton className="h-9 w-full" label="Loading Entity Name" /> : <input type="text" aria-label="Entity Name" value={dirty ? draft : (isNew ? globalName || value : value)} readOnly={!canEdit || saving} required maxLength={300} onChange={event => { setDraft(event.target.value); setDirty(true); setError(''); change.current(event.target.value); }} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} className="w-full rounded-lg border px-2 py-2" />}
    </label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {saving && <Skeleton className="mt-1 h-3 w-24" label="Saving Entity Name" />}
  </div>;
}
