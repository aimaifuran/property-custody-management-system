import { useEffect, useState } from 'react';
import axios from 'axios';
import Skeleton from './Skeleton';

export default function UserAccountSelect({ person, onChange }) {
  const [offline, setOffline] = useState([]);
  const [creatingOffline, setCreatingOffline] = useState(false);
  const [offlineName, setOfflineName] = useState('');
  const [offlineOffice, setOfflineOffice] = useState('');
  const [savingOffline, setSavingOffline] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([axios.get('/users', { signal: controller.signal }), axios.get('/offline-recipients', { signal: controller.signal })]).then(([{ data }, offlineResponse]) => { setAccounts((data.data || []).filter(user => user.role === 'user')); setOffline(offlineResponse.data.data || []); })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load user accounts. Refresh to try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  if (loading) return <Skeleton className="h-8 w-full" label="Loading user accounts" />;
  return <div className="mb-3 block"><span className="mb-1 block text-xs font-semibold">User account or offline recipient</span>
    <select aria-label="Linked user account" value={creatingOffline ? 'new-offline' : person?.offlineRecipient ? `offline:${person.offlineRecipient?._id || person.offlineRecipient}` : person?.user?._id || person?.user || ''} onChange={event => {
      setCreatingOffline(event.target.value === 'new-offline');
      if (event.target.value === 'new-offline') { setOfflineName(person?.name || ''); setOfflineOffice(person?.designation || ''); return; }
      if (event.target.value.startsWith('offline:')) {
        const record = offline.find(row => row._id === event.target.value.slice(8));
        onChange({ ...person, user: undefined, offlineRecipient: record._id, name: record.name, designation: record.designation || record.office, office: record.office }); return;
      }
      const user = accounts.find(account => account._id === event.target.value);
      onChange(user ? { ...person, offlineRecipient: undefined, user: user._id, name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '), designation: user.office } : { ...person, user: undefined, offlineRecipient: undefined });
    }} className="w-full rounded-lg border bg-white px-2 py-2"><option value="">Match by name / manual entry</option>{accounts.map(user => <option key={user._id} value={user._id}>{[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ')} ({user.username}) · {user.office}</option>)}<optgroup label="Offline offices - no login">{offline.map(record => <option key={record._id} value={`offline:${record._id}`}>{record.name} / {record.office}</option>)}</optgroup><option value="new-offline">Enter an offline recipient manually</option></select>
    {creatingOffline && <div className="mt-2 space-y-2"><input aria-label="Offline recipient name" placeholder="Recipient name" value={offlineName} onChange={event => setOfflineName(event.target.value)} className="w-full rounded-lg border p-2" /><input aria-label="Offline office" placeholder="Office" value={offlineOffice} onChange={event => setOfflineOffice(event.target.value)} className="w-full rounded-lg border p-2" /><button type="button" disabled={savingOffline || !offlineName.trim() || !offlineOffice.trim()} className="rounded-lg bg-teal-700 px-3 py-2 text-white disabled:opacity-50" onClick={async () => {
      setSavingOffline(true); setError('');
      try { const { data } = await axios.post('/offline-recipients', { name: offlineName, office: offlineOffice }); const record = data.data; setOffline(previous => [record, ...previous]); onChange({ ...person, user: undefined, offlineRecipient: record._id, name: record.name, designation: record.office, office: record.office }); setCreatingOffline(false); }
      catch (err) { setError(err.response?.data?.message || 'Unable to save offline recipient.'); }
      finally { setSavingOffline(false); }
    }}>{savingOffline ? 'Saving...' : 'Save Offline Recipient'}</button></div>}
    {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
  </div>;
}
