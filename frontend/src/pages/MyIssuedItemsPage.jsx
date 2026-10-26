import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { PackageCheck, CircleCheck, Clock3, RotateCcw, CircleX } from 'lucide-react';
import { loadAccountItems, mergeAccountItems, returnSubmission } from '../utils/accountItems';

function ItemStatus({ item }) {
  let label = item.status;
  let Icon = Clock3;
  let colors = 'border-amber-200 bg-amber-50 text-amber-800';
  if (item.transferred) {
    label = 'Transferred to another custodian';
    colors = 'border-slate-200 bg-slate-50 text-slate-700';
  } else if (item.status === 'Successfully returned') {
    Icon = PackageCheck;
    colors = 'border-emerald-200 bg-emerald-50 text-emerald-700';
  } else if (item.historyOnly && !item.pendingReturn) {
    Icon = PackageCheck;
    colors = 'border-slate-200 bg-slate-50 text-slate-700';
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
  const [returnItem, setReturnItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async (background = false) => {
    if (!background) { setLoading(true); setError(''); }
    try {
      const data = await loadAccountItems(axios, '/ris/my-items');
      setItems(previousRows => mergeAccountItems({ ...data, previousRows }));
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

  const requestReturn = async event => {
    event.preventDefault();
    if (submitting || !returnItem) return;
    const count = Number(returnItem.quantityRemaining);
    if (!Number.isInteger(count) || count <= 0 || count > returnItem.quantityRemaining) { setReturnError('This item is no longer available for return. Refresh your issued items.'); return; }
    setSubmitting(true); setReturnError('');
    try {
      const request = returnSubmission(returnItem, count);
      await axios.post(request.path, request.body);
      setItems(previous => previous.map(item => item.rowKey === returnItem.rowKey ? { ...item, pendingReturn: true, status: 'Awaiting admin confirmation' } : item));
      setReturnItem(null); setNotice('Return requested. The admin has been notified. Awaiting admin confirmation.');
      await load(true);
    } catch (error) { setReturnError(error.response?.data?.message || 'Unable to request return. Please try again.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <section className="minimal-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><PackageCheck size={24} /></div>
          <div><h1 className="text-2xl font-bold text-slate-800">My Issued Items</h1><p className="text-sm text-slate-500">Requests recorded under your account and items issued by the admin.</p></div>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
      </div>
    </section>
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : !error && <section className="minimal-surface p-6">
      {items.length === 0 ? <p className="text-sm text-slate-500">No requests or issued items have been recorded under your account yet.</p> : <TableScroll className="overflow-x-auto">
        <table className="user-issued-items-table min-w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500">{['Property / Item', 'Stock No.', 'Quantity Requested', 'Quantity Issued', 'RIS No.', 'ICS / PAR No.', 'Date Issued', 'Status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{items.map(item => <tr key={item.rowKey} className="border-b border-slate-100">
            <td className="p-3 font-medium">{item.description || item.stockNumber || 'Item'}</td><td className="p-3">{item.stockNumber || '—'}</td><td className="p-3">{item.quantityRequested ?? '—'}</td><td className="p-3">{item.quantityIssued ?? '—'}</td><td className="p-3">{item.risNumber || '—'}</td><td className="p-3">{item.documentNumber ? `${item.formType} ${item.documentNumber}` : '—'}</td><td className="p-3">{item.issuedAt ? new Date(item.issuedAt).toLocaleDateString() : '—'}</td><td className="p-3"><div className="flex flex-col items-start gap-2"><ItemStatus item={item} />
              {item.issued && !item.transferred && !item.historyOnly && Number(item.quantityRemaining) > 0 && !item.pendingReturn && <button type="button" onClick={() => { setReturnItem(item); setReturnError(''); setNotice(''); }} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white hover:bg-teal-800"><RotateCcw size={16} />Request Return</button>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </TableScroll>}
    </section>}
    {returnItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={requestReturn} role="dialog" aria-modal="true" aria-labelledby="request-return-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="request-return-title" className="text-lg font-semibold">Request Return</h2><p className="mt-2 text-sm text-slate-600">{returnItem.description || returnItem.stockNumber}</p>

      <p className="mt-3 text-sm text-slate-500">This item stays under your account until the admin confirms receipt.</p>
      {returnError && <p role="alert" className="mt-3 text-sm text-red-700">{returnError}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setReturnItem(null)} className="rounded-lg border px-3 py-2">Cancel</button><button type="submit" disabled={submitting} className="rounded-lg bg-teal-700 px-3 py-2 font-semibold text-white disabled:opacity-50">{submitting ? 'Sending...' : 'Request Return'}</button></div>
    </form></div>}
  </div>;
}
