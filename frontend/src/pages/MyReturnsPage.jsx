import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function MyReturnsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState('');
  const [message, setMessage] = useState('');
  const load = async (background = false) => {
    if (!background) { setLoading(true); setError(''); }
    try {
      const { data } = await axios.get('/ris/my-returns');
      setItems(data.data || []);
    } catch (err) {
      if (!background) setError(err.response?.data?.message || 'Unable to load your return status. Please try again.');
    } finally { if (!background) setLoading(false); }
  };
  useEffect(() => {
    load();
    const refresh = () => { if (!document.hidden) load(true); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const submitReturn = async (item) => {
    const key = `${item.risId}-${item.itemId}`;
    setSubmitting(key); setError(''); setMessage('');
    try {
      await axios.post('/ris/my-returns', { risId: item.risId, itemId: item.itemId, quantity: quantities[key] ?? item.quantityRemaining });
      setMessage('Return slip sent to admin. Your name and issued item were recorded automatically.');
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Unable to send your return slip'); }
    finally { setSubmitting(''); }
  };
  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <section className="minimal-surface p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold text-slate-800">Returned Items</h1><button type="button" onClick={() => load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm">Refresh</button></div>
      <p className="mt-2 text-sm text-slate-500">Select the quantity you are returning and send it to the admin. Your name and item details fill in automatically from your issued items. The admin confirms receipt to complete the return.</p>
    </section>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    {message && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : !error && <section className="minimal-surface p-6">
      {items.length === 0 ? <p className="text-slate-500">No items have been issued to your account yet.</p> : <TableScroll className="overflow-x-auto"><table className="min-w-full text-left text-sm">
        <thead><tr className="border-b text-slate-500">{['Item', 'RIS No.', 'Issued', 'Returned', 'Remaining', 'Return result', 'Return slip details', 'Return item'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={`${item.risId}-${item.itemId}`} className="border-b border-slate-100">
          <td className="p-3 font-medium">{item.description || item.stockNumber}</td><td className="p-3">{item.risNumber || '—'}</td><td className="p-3">{item.quantityIssued}</td><td className="p-3">{item.quantityReturned}</td><td className="p-3">{item.quantityRemaining}</td>
          <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.quantityRemaining === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.status}</span></td>
          <td className="p-3">{item.returns.length ? item.returns.map((entry, index) => <div key={index} className="mb-2">{entry.prsNumber || 'Return slip'} · Qty {entry.quantity} · {new Date(entry.date).toLocaleDateString()}<div>{entry.status === 'PENDING' ? 'Awaiting admin confirmation' : entry.status === 'REJECTED' ? `Return rejected: ${entry.rejectionReason}` : 'Receipt confirmed'}</div>{entry.receivedBy && <div>Received by: {entry.receivedBy}</div>}{entry.note && <div>{entry.note}</div>}</div>) : 'No return submitted'}</td>
          <td className="p-3">{item.pendingReturn ? 'Sent to admin' : item.quantityRemaining > 0 ? <div className="space-y-2"><input aria-label={`Return quantity for ${item.description || item.stockNumber}`} type="number" min="1" max={item.quantityRemaining} step="1" value={quantities[`${item.risId}-${item.itemId}`] ?? item.quantityRemaining} onChange={event => setQuantities(prev => ({ ...prev, [`${item.risId}-${item.itemId}`]: event.target.value }))} className="w-24 rounded-lg border p-2" /><button type="button" disabled={!!submitting} onClick={() => submitReturn(item)} className="rounded-lg bg-emerald-600 px-3 py-2 text-white disabled:opacity-50">{submitting === `${item.risId}-${item.itemId}` ? <Skeleton className="h-4 w-28" /> : 'Send return to admin'}</button></div> : 'Return complete'}</td>
        </tr>)}</tbody>
      </table></TableScroll>}
    </section>}
  </div>;
}
