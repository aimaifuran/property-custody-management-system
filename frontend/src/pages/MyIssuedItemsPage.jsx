import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PackageCheck, CircleCheck, Clock3, RotateCcw, CircleX } from 'lucide-react';

function ItemStatus({ item }) {
  let label = item.status;
  let Icon = Clock3;
  let colors = 'border-amber-200 bg-amber-50 text-amber-800';
  if (item.status === 'Successfully returned') {
    Icon = PackageCheck;
    colors = 'border-emerald-200 bg-emerald-50 text-emerald-700';
  } else if (item.pendingReturn || item.status === 'Partially returned') {
    Icon = item.pendingReturn ? Clock3 : RotateCcw;
  } else if (item.requestStatus === 'REJECTED') {
    Icon = CircleX;
    colors = 'border-rose-200 bg-rose-50 text-rose-700';
  } else if (item.issued || ['APPROVED', 'ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(item.requestStatus)) {
    label = item.issued ? 'Approved' : 'Approved ? awaiting issuance';
    Icon = CircleCheck;
    colors = 'border-blue-200 bg-blue-50 text-blue-700';
  } else {
    label = 'Pending request';
  }
  return <span title={item.status} className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 font-semibold ${colors}`}>
    <Icon size={16} className="shrink-0" aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export default function MyIssuedItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (background = false) => {
    if (!background) { setLoading(true); setError(''); }
    try {
      const { data } = await axios.get('/ris/my-items');
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
          <div><h1 className="text-2xl font-bold text-slate-800">My Issues Items</h1><p className="text-sm text-slate-500">Requests recorded under your account and items issued by the admin.</p></div>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
      </div>
    </section>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : !error && <section className="minimal-surface p-6">
      {items.length === 0 ? <p className="text-sm text-slate-500">No requests or issued items have been recorded under your account yet.</p> : <TableScroll className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500">{['Property / Item', 'Stock No.', 'Quantity Requested', 'Quantity Issued', 'RIS No.', 'ICS / PAR No.', 'Date Issued', 'Status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.risId + '-' + item.itemId} className="border-b border-slate-100">
            <td className="p-3 font-medium">{item.description || item.stockNumber || 'Item'}</td><td className="p-3">{item.stockNumber || '—'}</td><td className="p-3">{item.quantityRequested ?? 0}</td><td className="p-3">{item.quantityIssued ?? 0}</td><td className="p-3">{item.risNumber || '—'}</td><td className="p-3">{item.documentNumber ? `${item.formType} ${item.documentNumber}` : '—'}</td><td className="p-3">{item.issuedAt ? new Date(item.issuedAt).toLocaleDateString() : '—'}</td><td className="p-3"><ItemStatus item={item} /></td>
          </tr>)}</tbody>
        </table>
        <Link to="/my-returns" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">View Returned Items</Link>
      </TableScroll>}
    </section>}
  </div>;
}
