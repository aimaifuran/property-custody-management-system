import SearchInput from './SearchInput';
import { useEffect, useState } from 'react';
import axios from 'axios';
import Skeleton from './Skeleton';

export default function UserAccountSelect({ person, onChange }) {
  const [offline, setOffline] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = () => Promise.all([axios.get('/users', { signal: controller.signal }), axios.get('/offline-recipients', { signal: controller.signal })]).then(([{ data }, offlineResponse]) => { setAccounts((data.data || []).filter(user => user.role === 'user')); setOffline(offlineResponse.data.data || []); })
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load user accounts. Refresh to try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    load(); window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); };
  }, []);
  if (loading) return <Skeleton className="h-8 w-full" label="Loading user accounts" />;
  return <div className="mb-3 block"><span className="mb-1 block text-xs font-semibold">User Account</span>
    <SearchInput aria-label="Linked user account" placeholder="Search user account" value={person?.name || ''} options={[
      ...accounts.map(user => ({ value: user._id, label: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '), keywords: `${user.username} ${user.office}`, user })),
      ...offline.map(record => ({ value: `offline:${record._id}`, label: record.name, keywords: record.office, record }))
    ]} onChange={name => onChange({ ...person, name, user: undefined, offlineRecipient: undefined })} onSelect={option => {
      if (option.record) { const record = option.record; onChange({ ...person, user: undefined, offlineRecipient: record._id, name: record.name, designation: record.designation || record.office, office: record.office }); }
      else { const user = option.user; onChange({ ...person, offlineRecipient: undefined, user: user._id, name: option.label, designation: user.office, office: user.office }); }
    }} className="w-full rounded-lg border bg-white px-2 py-2" />
    {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
  </div>;
}
