import { useEffect, useMemo, useState } from 'react';
import RecordFormPreview from '../components/RecordFormPreview';
import axios from 'axios';
import { groupIssuedItemsByUser } from '../utils/issuedItemsByUser';
import { ArrowLeft, Folder } from 'lucide-react';
import TableScroll from '../components/TableScroll';
import { PageSkeleton } from '../components/Skeleton';

function IssuedFormDialog({ document, onClose }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    axios.get(`/ris/issued-form/${document.risId}`, { signal: controller.signal })
      .then(({ data }) => setRecord({ type: 'RIS', title: 'Requisition and Issue Slip', details: data.data }))
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load RIS form.'); });
    return () => controller.abort();
  }, [document.risId]);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div role="dialog" aria-modal="true" aria-label={`RIS ${document.risNumber}`} className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">RIS {document.risNumber}</h2><button autoFocus type="button" onClick={onClose} className="rounded-lg border px-3 py-2">Close</button></div>
    {error ? <p role="alert" className="text-red-700">{error}</p> : record ? <RecordFormPreview record={record} /> : <p role="status">Loading form...</p>}
  </div></div>;
}

const control = 'mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
export default function IssuedItemsPage() {
  const [viewedDocument, setViewedDocument] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [item, setItem] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (refresh === 0) setLoading(true);
    setError('');
    axios.get('/ris/issued-items', { signal: controller.signal, params: { refreshedAt: Date.now() } }).then(({ data }) => {
      const records = data.data || [];
      setItems(records);
      setItem(previous => records.some(record => record.id === previous) ? previous : '');
    })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load issued items.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const update = () => { if (!document.hidden) setRefresh(value => value + 1); };
    const timer = window.setInterval(update, 10000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const itemOptions = useMemo(() => items.filter(row => row.quantity > 0 && row.holders.some(holder => holder.quantity > 0)).sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(row => !item || row.id === item).map(row => {
      const holders = row.holders.filter(holder => `${holder.name} ${holder.username || ''} ${holder.office} ${holder.units.map(unit => unit.serialNumber || '').join(' ')}`.toLowerCase().includes(query));
      return { ...row, holders, quantity: holders.reduce((sum, holder) => sum + holder.quantity, 0) };
    }).filter(row => row.holders.length);
  }, [items, search, item]);
  const folders = useMemo(() => groupIssuedItemsByUser(visible), [visible]);
  const openedFolder = folders.find(folder => folder.id === selectedUser);
  return <div className="space-y-5">
    <div className="flex flex-col items-start justify-between gap-4 xl:flex-row">
      <div className="flex w-full items-start gap-3">
    <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(140px,1fr)]"><label className="text-sm font-semibold">Search<input type="search" aria-label="Search issued items" placeholder="User account, office or serial number" value={search} onChange={event => setSearch(event.target.value)} className={control} /></label><label className="text-sm font-semibold">Items<select aria-label="Items" value={item} onChange={event => { setItem(event.target.value); setSelectedUser(null); }} className={control}><option value="">All items</option>{itemOptions.map(row => <option key={row.id} value={row.id}>{row.name} ({row.unit})</option>)}</select></label></div>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    </section>
      </div>
    </div>
    {loading ? <PageSkeleton /> : !error && <>
      {!folders.length && <p className="rounded-xl border bg-white p-8 text-center text-slate-500">No user folders match these filters.</p>}
      {selectedUser ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button type="button" onClick={() => setSelectedUser(null)} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><ArrowLeft size={17} />All user folders</button>
        {openedFolder ? <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{openedFolder.name}</h3><p className="text-sm text-slate-500">{openedFolder.office}</p></div><span className="text-sm font-semibold">{openedFolder.items.length} item groups | {openedFolder.quantity} units issued</span></div>
          {!openedFolder.items.length && <p className="mb-4 text-sm text-slate-500">No items are currently issued to this user.</p>}
          <TableScroll><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['Item', 'Funds', 'Quantity Held', 'View Form'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{openedFolder.items.map(row => <tr key={row.id} className="border-b border-slate-200">
            <td className="p-3 font-semibold">{row.name}</td><td className="p-3">{[...new Set(row.units.map(unit => unit.fundCluster).filter(Boolean))].join(', ') || '-'}</td><td className="p-3">{row.quantity}</td>
            <td className="p-3">{[...new Map(row.units.map(unit => [unit.risId, unit])).values()].map(unit => <button key={unit.risId} type="button" onClick={() => setViewedDocument(unit)} aria-label={`View Form RIS ${unit.risNumber}`} className="mb-2 block rounded-lg border border-teal-200 px-3 py-2 text-teal-800 hover:bg-teal-50">View Form <span className="text-xs">(RIS {unit.risNumber})</span></button>)}</td>
          </tr>)}</tbody></table></TableScroll>
        </> : <p className="text-slate-500">No issued items in this folder match the current filters.</p>}
      </section> : <div className="flex flex-wrap items-start gap-3">{folders.map(folder => <button key={folder.id} type="button" onClick={() => setSelectedUser(folder.id)} aria-label={`Open issued items for ${folder.name}`} className="inline-flex w-fit max-w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-5 text-left shadow-sm transition hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-teal-600">
        <Folder size={28} className="shrink-0 text-teal-700" aria-hidden="true" /><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{folder.name}</h3><p className="mt-1 break-words text-sm text-slate-500">{folder.office || 'No office recorded'}</p></div>
      </button>)}</div>}
    </>}
    {viewedDocument && <IssuedFormDialog key={viewedDocument.risId} document={viewedDocument} onClose={() => setViewedDocument(null)} />}
  </div>;
}
