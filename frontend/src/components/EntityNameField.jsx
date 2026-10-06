import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import Skeleton from './Skeleton';

export default function EntityNameField({ value = '', onChange, isNew = true }) {
  const { user } = useAuth();
  const [globalName, setGlobalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef(null);
  useEffect(() => { input.current?.setCustomValidity(editing ? 'Save Entity Name before saving the form.' : ''); }, [editing, loading]);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const { data } = await axios.get('/settings/entity-name', { signal: controller.signal });
        setGlobalName(data.data.entityName || ''); setError('');
      } catch { if (!controller.signal.aborted) setError('Unable to load Entity Name. Refresh to retry.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    load();
    window.addEventListener('entity-name-updated', load);
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('entity-name-updated', load); window.removeEventListener('focus', load); };
  }, []);
  useEffect(() => {
    if (!loading && !error && isNew && globalName && value !== globalName) change.current(globalName);
  }, [globalName, value, isNew, loading, error]);
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.patch('/settings/entity-name', { entityName: draft });
      setGlobalName(data.data.entityName); change.current(data.data.entityName); setEditing(false);
      window.dispatchEvent(new Event('entity-name-updated'));
      toast.success('Entity Name saved for new forms');
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to save Entity Name'); }
    finally { setSaving(false); }
  };
  return <div className="entity-name-field min-w-0">
    <label className="block"><span className="mb-1 block font-semibold">Entity Name:</span>
      {loading ? <Skeleton className="h-9 w-full" label="Loading Entity Name" /> : <input ref={input} type="text" aria-label="Entity Name" value={editing ? draft : value} readOnly={!editing} required maxLength={300} onChange={event => setDraft(event.target.value)} className="w-full rounded-lg border px-2 py-2" />}
    </label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {user?.role === 'admin' && !loading && !error && <div className="mt-2 flex flex-wrap gap-2">
      {editing ? <><button type="button" disabled={saving || !draft.trim()} onClick={save}>{saving ? <Skeleton className="h-4 w-16" label="Saving Entity Name" /> : 'Save Entity Name'}</button><button type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button></> : <button type="button" onClick={() => { setDraft(globalName || value); setEditing(true); }}>{globalName ? 'Edit Entity Name' : 'Set Entity Name'}</button>}
    </div>}
  </div>;
}
