import { buildItemPropertyCardExport, itemLedgerSelection } from '../utils/itemPropertyCardExport';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
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
const propertyNumberLabel = item => item.displayStockNumber || String(item.stockNumber || '').replace(/~[a-f\d]{24}$/i, '');
const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const Info = ({ label, value }) => <div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value ?? 'Not configured'}</dd></div>;

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('item');
  const legacyCard = params.get('card');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { editorRef, recordsRef } = useUpdateFormNavigation(selectedId);
  const select = id => { setParams(id ? { item: id } : {}); };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get('/property-cards/stock-ledger', { signal: controller.signal, params: { search, sort: 'received', page, limit, ...(legacyCard ? { card: legacyCard } : {}) } })
      .then(({ data: response }) => { setData(response.data); if (legacyCard && response.data.initialItemId) setParams({ item: response.data.initialItemId }, { replace: true }); })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load Property Cards.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, limit, refresh, legacyCard, setParams]);

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

  const { rows } = itemLedgerSelection(details, { activityOnly: true });
  const exportCard = async (print = false) => {
    if (!details || exporting) return;
    setExporting(true);
    try {
      const payload = buildItemPropertyCardExport(details, { activityOnly: true });
      await exportOfficialFormPdf('PROPERTY CARD', payload, print);
    } catch { toast.error('Unable to prepare Property Card PDF'); }
    finally { setExporting(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold">Property Card</h1><p className="mt-1 text-sm text-slate-500">Property Card history appears after an item is issued to a user through RIS.</p></div><button type="button" onClick={() => setRefresh(value => value + 1)} className={control} aria-label="Refresh Property Cards"><RefreshCw size={16} /></button></div>
    <section ref={recordsRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold">Rows per page<select aria-label="Rows per page" value={limit} onChange={event => { setLimit(Number(event.target.value)); setPage(1); }} className={`${control} mt-1 block`}>{[5, 10, 25].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="ml-auto w-full text-xs font-semibold sm:w-80">Search items<input aria-label="Search items" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Item code, name or description" className={`${control} mt-1 w-full`} /></label>
      </div>
      {error && <p role="alert" className="mb-4 text-rose-700">{error}</p>}
      {loading && !data ? <PageSkeleton /> : <TableScroll className="property-stock-results"><div><table className="property-stock-table w-full text-left text-sm"><colgroup><col style={{ width: '28%' }} /><col style={{ width: '20%' }} /><col style={{ width: '16%' }} /><col style={{ width: '10%' }} /><col style={{ width: '26%' }} /></colgroup><thead className="bg-slate-100"><tr>{['Item Name', 'Property Number', 'Category', 'Unit', 'Actions'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data?.items.map(item => <tr key={item._id} className={`border-b border-slate-200 ${item.isNew ? 'property-stock-row-new' : ''}`}><td className="p-3 font-semibold">{item.description || item.name}</td><td className="p-3">{propertyNumberLabel(item)}</td><td className="p-3">{categoryLabel(item.category)}</td><td className="p-3">{item.unit}</td><td className="p-3">{item.hasPropertyCard ? <button type="button" onClick={() => select(item._id)} className="view-property-card-button whitespace-nowrap rounded-lg border px-3 py-2">View Property Card</button> : <span className="text-sm text-slate-500">Not issued</span>}</td></tr>)}</tbody></table>{!data?.items.length && <p className="py-8 text-center text-sm text-slate-500">No stock items match these filters.</p>}</div></TableScroll>}
      {data && <Pagination showPageSize={false} page={page} pageCount={data.pagination.totalPages} perPage={limit} onPageChange={setPage} onPerPageChange={value => { setLimit(value); setPage(1); }} />}
    </section>
    {selectedId && <section ref={editorRef} className="form-document form-frame property-card-ledger scroll-mt-6 p-6">
      <FormEditorHeader title="Property Card" description="Records appear after issuance to a user. Each issuance, return or transfer is grouped by document; balances include all stock receipts." onClose={() => select(null)} />
      {detailError && <p role="alert" className="mt-4 text-rose-700">{detailError}</p>}
      {detailLoading && (!details || String(details.item._id) !== selectedId) ? <PageSkeleton /> : details && String(details.item._id) === selectedId && <>
        <dl className="pc-item-information mt-5 grid gap-3 md:grid-cols-2">
          <Info label="Entity Name" value={details.exportHeader?.entityName || 'Not configured'} />
          <Info label="Fund Cluster" value={details.exportHeader?.fundCluster || 'Not recorded'} />
        </dl>

        {details.summary.reconciliationNeeded && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ledger balance ({details.summary.currentBalance}) differs from available stock ({details.summary.availableStock}). Review the source transactions with the administrator; balances cannot be edited here.</p>}
        <div className="pc-history-container mt-4">
          <TableScroll label="Property Card history">
            <table className="pc-history-table w-full text-left text-sm">
              <thead><tr>{['Date', 'Reference No.', 'Issued', 'Amount', 'Office/Officer', 'Action'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}>
                <td className="pc-history-date">{dateLabel(row.date)}</td>
                <td>{row.source?.type} {row.reference}</td>
                <td>{row.issued || ''}</td>
                <td className="pc-history-amount">{money(row.amount)}</td>
                <td>
                  {row.person && <div>{row.person}</div>}
                  {row.office && row.office !== row.person && <div>{row.office}</div>}
                  {!row.person && !row.office && '?'}
                </td>
                <td>
                  <div className="pc-history-actions">
                      <RecordActionButton action="pdf" busy={exporting} onClick={() => exportCard()} />
                      <RecordActionButton action="print" busy={exporting} onClick={() => exportCard(true)} />
                  </div>
                </td>
              </tr>)}</tbody>
            </table>
            {!rows.length && <p className="py-8 text-center text-sm text-slate-500">No issuance records yet for this selection. Records appear after items are issued to a user.</p>}
          </TableScroll>
        </div>
      </>}
    </section>}
  </div>;
}
