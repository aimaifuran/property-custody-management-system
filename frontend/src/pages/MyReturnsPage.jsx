import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { CircleCheck, Clock3, RotateCcw } from 'lucide-react';
import { loadAccountItems, mergeAccountItems } from '../utils/accountItems';

export default function MyReturnsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (background = false) => {
    if (!background) { setLoading(true); setError(''); }
    try {
      const data = await loadAccountItems(axios, '/ris/my-returns');
      setItems(previousRows => mergeAccountItems({ ...data, previousRows }).filter(item => Number(item.quantityReturned) > 0).map(item => ({ ...item, returns: item.returns.filter(entry => entry.status === 'RETURNED') })));
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
  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <section className="minimal-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold text-slate-800">Returned Items</h1><button type="button" onClick={() => load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm">Refresh</button></div>
      <p className="mt-2 text-sm text-slate-500">The admin records returned items for your account. Confirmed returns, returned quantities, and remaining items appear here automatically.</p>
    </section>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    {!error && <section className="minimal-surface p-6">
      {items.length === 0 ? <p className="text-slate-500">No confirmed returns have been recorded for your account yet.</p> : <TableScroll className="overflow-x-auto"><table className="user-returns-table w-full text-left text-sm">
        <thead className="hidden lg:table-header-group"><tr className="border-b text-slate-500">{['Item', 'RIS No.', 'Issued', 'Returned', 'Remaining', 'Return result'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
        <tbody>{items.map(item => <tr key={item.rowKey} className="mb-4 block rounded-xl border border-slate-200 p-3 last:mb-0 lg:table-row lg:rounded-none lg:border-x-0 lg:border-t-0 lg:p-0">
          <td data-label="Item" className="p-3 font-medium">{item.itemName || item.description || item.stockNumber}</td><td data-label="RIS No." className="p-3">{item.risNumber || '—'}</td><td data-label="Issued" className="p-3">{item.quantityIssued ?? '—'}</td><td data-label="Returned" className="p-3">{item.quantityReturned}</td><td data-label="Remaining" className="p-3">{item.quantityRemaining}</td>
          <td data-label="Return result" className="p-3"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold leading-snug ${item.quantityRemaining === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {item.quantityRemaining === 0 ? <CircleCheck size={16} className="shrink-0" aria-hidden="true" /> : item.pendingReturn ? <Clock3 size={16} className="shrink-0" aria-hidden="true" /> : <RotateCcw size={16} className="shrink-0" aria-hidden="true" />}
            <span>{item.status}</span>
          </span></td>

        </tr>)}</tbody>
      </table></TableScroll>}
    </section>}
  </div>;
}
