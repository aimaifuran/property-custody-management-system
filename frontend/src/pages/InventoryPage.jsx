import { buildItemPropertyCardExport, itemLedgerSelection } from '../utils/itemPropertyCardExport';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { FileText, RefreshCw } from 'lucide-react';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import Pagination from '../components/Pagination';
import RecordActionButton from '../components/RecordActionButton';
import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const dateLabel = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '?';
const money = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const categoryLabel = value => String(value || '').trim().toLowerCase() === 'general' ? '' : value || '';
const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const Info = ({ label, value }) => <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value ?? 'Not configured'}</dd></div>;

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('item');
  const legacyCard = params.get('card');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('received');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [type, setType] = useState('');
  const [office, setOffice] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const { editorRef, recordsRef } = useUpdateFormNavigation(selectedId);
  const select = id => { setType(''); setOffice(''); setFrom(''); setTo(''); setParams(id ? { item: id } : {}); };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get('/property-cards/stock-ledger', { signal: controller.signal, params: { search, category, status, sort, page, limit, ...(legacyCard ? { card: legacyCard } : {}) } })
      .then(({ data: response }) => { setData(response.data); if (legacyCard && response.data.initialItemId) setParams({ item: response.data.initialItemId }, { replace: true }); })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load Property Cards.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, category, status, sort, page, limit, refresh, legacyCard, setParams]);

  useEffect(() => {
    if (!selectedId) { setDetails(null); return; }
    const controller = new AbortController();
    setDetailLoading(true); setDetailError('');
    axios.get(`/property-cards/stock-ledger/${selectedId}`, { signal: controller.signal })
      .then(({ data }) => setDetails(data.data))
      .catch(error => { if (!controller.signal.aborted) setDetailError(error.response?.data?.message || 'Unable to load item history.'); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, refresh]);

  useEffect(() => {
    const update = () => { if (!document.hidden) setRefresh(value => value + 1); };
    const timer = setInterval(update, 30000); window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  const { rows, beginning, ending, initialStock } = itemLedgerSelection(details, { from, to, type, office, activityOnly: true });
  const exportCard = async (print = false) => {
    if (!details || exporting) return;
    setExporting(true);
    try {
      const payload = buildItemPropertyCardExport(details, { from, to, type, office, activityOnly: true });
      await exportOfficialFormPdf('PROPERTY CARD', payload, print);
    } catch { toast.error('Unable to prepare Property Card PDF'); }
    finally { setExporting(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Property Card</h1><p className="mt-1 text-sm text-slate-500">View stock balances and the complete movement history of each item.</p></div><button type="button" onClick={() => setRefresh(value => value + 1)} className={control} aria-label="Refresh Property Cards"><RefreshCw size={16} /></button></div>
    {data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['Total Items Tracked', data.summary.total], ['Items In Stock', data.summary.inStock], ['Out-of-Stock Items', data.summary.outOfStock]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>)}</div>}
    <section ref={recordsRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-3"><label className="flex-1 text-xs font-semibold">Search items<input aria-label="Search items" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Item code, name or description" className={`${control} mt-1 w-full`} /></label><label className="text-xs font-semibold">Category<select aria-label="Category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }} className={`${control} mt-1 block`}><option value="">All categories</option>{data?.categories.filter(value => categoryLabel(value)).map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-semibold">Stock status<select aria-label="Stock status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={`${control} mt-1 block`}><option value="">All statuses</option>{['In Stock', 'Out of Stock'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-semibold">Sort<select aria-label="Sort Property Card items" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className={`${control} mt-1 block`}><option value="received">Recently Received</option><option value="name">Item Name</option></select></label></div>
      {error && <p role="alert" className="mb-4 text-rose-700">{error}</p>}
      {loading && !data ? <PageSkeleton /> : <TableScroll><table className="property-stock-table w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['Item Code', 'Category', 'Description', 'Unit', 'Current Balance', 'Stock Status', 'Last Movement', 'Actions'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data?.items.map(item => <tr key={item._id} className={`border-b border-slate-200 ${item.isNew ? 'property-stock-row-new' : ''}`}><td className="p-3 font-semibold">{item.stockNumber}</td><td className="p-3">{categoryLabel(item.category)}</td><td className="p-3">{item.description}</td><td className="p-3">{item.unit}</td><td className="p-3 font-semibold">{item.quantityOnHand}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.stockStatus === 'Out of Stock' ? 'bg-rose-50 text-rose-800' : item.stockStatus === 'Low Stock' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{item.stockStatus}</span></td><td className="p-3">{dateLabel(item.lastMovement)}</td><td className="p-3"><button type="button" onClick={() => select(item._id)} className="whitespace-nowrap rounded-lg border px-3 py-2">View Property Card</button></td></tr>)}</tbody></table>{!data?.items.length && <p className="py-8 text-center text-sm text-slate-500">No stock items match these filters.</p>}</TableScroll>}
      {data && <Pagination showPageSize page={page} pageCount={data.pagination.totalPages} perPage={limit} onPageChange={setPage} onPerPageChange={value => { setLimit(value); setPage(1); }} />}
    </section>
    {selectedId && <section ref={editorRef} className="form-document form-frame property-card-ledger scroll-mt-6 p-6">
      <FormEditorHeader title="Property Card" description="Records appear after issuance to a user. Each issuance, return or transfer is grouped by document; balances include all stock receipts." onClose={() => select(null)} />
      {detailError && <p role="alert" className="mt-4 text-rose-700">{detailError}</p>}
      {detailLoading && (!details || String(details.item._id) !== selectedId) ? <PageSkeleton /> : details && String(details.item._id) === selectedId && <>
        <dl className="pc-item-information mt-5 grid gap-3 md:grid-cols-2">
          <Info label="Entity Name" value={details.exportHeader?.entityName || 'Not configured'} />
          <Info label="Fund Cluster" value={details.exportHeader?.fundCluster || 'Not recorded'} />
        </dl>
        <dl className="pc-stock-summary mt-5 grid grid-cols-2 gap-4 border-y border-slate-300 py-4 lg:grid-cols-5">{[['Stock Before First Issuance', initialStock], ['Total Received', details.summary.received], ['Total Issued', details.summary.issued], ['Eligible Returns', details.summary.returned], ['Current Available Stock', details.summary.availableStock]].map(([label, value]) => <Info key={label} label={label} value={value} />)}</dl>
        {details.summary.reconciliationNeeded && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ledger balance ({details.summary.currentBalance}) differs from available stock ({details.summary.availableStock}). Review the source transactions with the administrator; balances cannot be edited here.</p>}
        <div className="mt-5 flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">From<input type="date" aria-label="History from date" value={from} onChange={event => setFrom(event.target.value)} className={`${control} mt-1 block`} /></label><label className="text-xs font-semibold">To<input type="date" aria-label="History to date" min={from} value={to} onChange={event => setTo(event.target.value)} className={`${control} mt-1 block`} /></label><label className="text-xs font-semibold">Transaction type<select aria-label="Transaction type" value={type} onChange={event => setType(event.target.value)} className={`${control} mt-1 block`}><option value="">All issuance activity</option>{['Issue', 'Return', 'Transfer'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-semibold">Office / custodian<input aria-label="Office or custodian" value={office} onChange={event => setOffice(event.target.value)} className={`${control} mt-1 block`} /></label><div className="ml-auto flex gap-2"><RecordActionButton action="pdf" busy={exporting} onClick={() => exportCard()} /><RecordActionButton action="print" busy={exporting} onClick={() => exportCard(true)} /></div></div>
        <div className="mt-3 text-sm text-slate-500">{from ? 'Period beginning' : 'Stock before first issuance'}: {beginning} | Period ending: {ending} | Current available stock: {details.summary.availableStock}. Row balances show remaining stock after each approved issuance or confirmed return.</div>
        <div className="pc-history-container mt-4">
          <TableScroll label="Property Card history">
            <table className="pc-history-table w-full text-left text-sm">
              <thead><tr>{['Date', 'Reference No.', 'Transaction Type', 'Received', 'Issued', 'Balance After Transaction', 'Amount', 'Office / Custodian', 'Action'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}>
                <td className="pc-history-date">{dateLabel(row.date)}</td>
                <td>{row.source?.type} {row.reference}</td>
                <td>{row.type}</td>
                <td>{row.received || ''}</td>
                <td>{row.issued || ''}</td>
                <td><span className="pc-history-balance">{row.balance}</span></td>
                <td className="pc-history-amount">{money(row.amount)}</td>
                <td>{row.office || row.person || '?'}</td>
                <td>{row.source ? <Link to={row.source.href} className="pc-history-document" aria-label={`View ${row.source.type} ${row.reference}`}><FileText size={16} aria-hidden="true" /><span>View Document</span></Link> : <span className="text-xs text-slate-500">Legacy reference</span>}</td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No issuance records yet for this selection. Records appear after items are issued to a user.</p>}
          </TableScroll>
        </div>
      </>}
    </section>}
  </div>;
}
