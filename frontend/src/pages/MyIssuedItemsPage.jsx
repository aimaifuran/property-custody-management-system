import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';

export default function MyIssuedItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (background = false) => {
    if (!background) { setLoading(true); setError(''); }
    try {
      const { data } = await axios.get('/ris/my-returns');
      setItems(data.data || []);
    } catch (err) {
      if (!background) setError(err.response?.data?.message || 'Unable to load your issued items. Please try again.');
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><PackageCheck size={24} /></div>
          <div><h1 className="text-2xl font-bold text-slate-800">My Issues Items</h1><p className="text-sm text-slate-500">Items issued under your name by the admin.</p></div>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
      </div>
    </section>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : !error && <section className="minimal-surface p-6">
      {items.length === 0 ? <p className="text-sm text-slate-500">No items have been issued to your account yet.</p> : <TableScroll className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500">{['Property / Item', 'Stock No.', 'Quantity Issued', 'RIS No.', 'Date Issued', 'Return Status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.risId + '-' + item.itemId} className="border-b border-slate-100">
            <td className="p-3 font-medium">{item.description || item.stockNumber || 'Item'}</td><td className="p-3">{item.stockNumber || '—'}</td><td className="p-3">{item.quantityIssued}</td><td className="p-3">{item.risNumber || '—'}</td><td className="p-3">{item.issuedAt ? new Date(item.issuedAt).toLocaleDateString() : '—'}</td><td className="p-3">{item.status}</td>
          </tr>)}</tbody>
        </table>
        <Link to="/my-returns" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">View Returned Items</Link>
      </TableScroll>}
    </section>}
  </div>;
}
