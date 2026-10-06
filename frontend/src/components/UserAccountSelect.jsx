import { useEffect, useState } from 'react';
import axios from 'axios';
import Skeleton from './Skeleton';

export default function UserAccountSelect({ person, onChange }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/users', { signal: controller.signal }).then(({ data }) => setAccounts((data.data || []).filter(user => user.role === 'user')))
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load user accounts. Refresh to try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  if (loading) return <Skeleton className="h-8 w-full" label="Loading user accounts" />;
  return <label className="mb-3 block"><span className="mb-1 block text-xs font-semibold">Linked user account</span>
    <select aria-label="Linked user account" value={person?.user?._id || person?.user || ''} onChange={event => {
      const user = accounts.find(account => account._id === event.target.value);
      onChange(user ? { ...person, user: user._id, name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '), designation: user.office } : { ...person, user: undefined });
    }} className="w-full rounded-lg border bg-white px-2 py-2"><option value="">Match by name / manual entry</option>{accounts.map(user => <option key={user._id} value={user._id}>{[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ')} ({user.username}) · {user.office}</option>)}</select>
    {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
  </label>;
}
