import NewFormButton from '../components/NewFormButton';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Eye, RefreshCw, Save, X } from 'lucide-react';
import RecordActionButton from '../components/RecordActionButton';
import Pagination from '../components/Pagination';
import { useAuth } from '../contexts/AuthContext';
import { buildPpePdf, PPE_COLUMNS, PPE_TITLE, ppeAmount, ppeTotal, ppeDate, ppePeriod } from '../utils/ppeListPdf';

const currentMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
const emptyReport = { serialNumber: '', lgu: '', fund: '', periodStart: '', periodEnd: '', reportDate: '', custodian: '', accountingStaff: '', postedDate: '', rows: [], recapitulation: [] };
const metadataFields = ['serialNumber', 'lgu', 'fund', 'reportDate', 'custodian', 'accountingStaff', 'postedDate'];
const recapColumns = [['stockNumber', 'Stock No.'], ['quantity', 'Quantity'], ['item', 'Item'], ['unit', 'Unit'], ['unitCost', 'Unit Cost'], ['totalCost', 'Total Cost'], ['accountCode', 'Account Code']];
const money = value => value == null || value === '' ? '' : Number(value).toFixed(2);

export default function MonthlyItemsReportPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [month, setMonth] = useState(currentMonth);
  const [isNewForm, setIsNewForm] = useState(false);
  const [form, setForm] = useState(emptyReport);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const dirty = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const { data } = await axios.get('/monthly-item-reports', { params: { month }, signal: controller.signal });
        if (controller.signal.aborted) return;
        const next = { ...data.data.report };
        for (const role of ['custodian', 'accountingStaff']) if (!next[role]) next[role] = getStickySignatory(role).name ?? '';
        setForm(previous => dirty.current && previous.month === month ? { ...previous } : next);
        setRecords(data.data.records); setError(''); setLoading(false);
      } catch (err) {
        if (!controller.signal.aborted) { setError(err.response?.data?.message || 'Unable to load recorded items.'); setLoading(false); }
      } finally { busy = false; }
    };
    load();
    const interval = setInterval(load, 30000);
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', load);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', load); };
  }, [month, refresh]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const selectMonth = value => { setIsNewForm(false); dirty.current = false; setLoading(true); if (value === month) setRefresh(previous => previous + 1); else setMonth(value); setPage(1); };
  const update = (key, value) => { if (['custodian', 'accountingStaff'].includes(key)) saveStickySignatory(key, { name: value }, 'name'); dirty.current = true; setForm(previous => ({ ...previous, [key]: value })); };
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const payload = Object.fromEntries(metadataFields.map(key => [key, form[key]]));
      if (isNewForm) await axios.post('/monthly-item-reports', { ...payload, month });
      else await axios.put(`/monthly-item-reports/${form._id}`, payload);
      setIsNewForm(false);
      dirty.current = false; toast.success('Report details saved'); setRefresh(value => value + 1);
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to save report details.'); }
    finally { setSaving(false); }
  };
  const exportRecord = async (record, mode) => {
    const printWindow = mode === 'print' ? window.open('', '_blank') : null;
    if (mode === 'print' && !printWindow) return toast.error('Allow pop-ups to open the printable report.');
    setExporting(true);
    try {
      const bytes = await buildPpePdf(record);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (mode === 'preview') setPreview(url);
      else if (mode === 'print') {
        printWindow.document.title = 'Monthly Items Report - Print';
        const frame = printWindow.document.createElement('iframe');
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
        frame.title = 'Printable Monthly Items Report'; frame.src = url;
        frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* Print remains available in the PDF viewer. */ } };
        printWindow.document.body.appendChild(frame);
        printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
      } else {
        const link = document.createElement('a'); link.href = url;
        link.download = `Monthly-Items-Report-${record.month}.pdf`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) { printWindow?.close(); toast.error(err.message || 'Unable to generate report.'); }
    finally { setExporting(false); }
  };
  const field = (key, label, type = 'text', required = false) => <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><input type={type} required={required} readOnly={!canEdit} value={form[key] || ''} maxLength={key === 'serialNumber' ? 100 : type === 'text' ? 200 : undefined} onChange={event => update(key, event.target.value)} className="w-full border px-2 py-1" /></label>;
  const pageCount = Math.max(1, Math.ceil(records.length / perPage));
  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Monthly Items Report</h1>{canEdit && <div className="mt-2"><NewFormButton disabled={!form.rows.length} onNew={() => { dirty.current = true; setIsNewForm(true); setForm(previous => ({ ...previous, serialNumber: '', fund: '', postedDate: '' })); }} /></div>}<p className="mt-1 text-sm text-slate-600">Recorded items are saved here automatically by their month of recording.</p></div><div className="flex items-end gap-2"><label className="text-sm font-semibold">Month<input type="month" min="2000-01" max="2100-12" value={month} onChange={event => { if (event.target.value) selectMonth(event.target.value); }} className="mt-1 block rounded-lg border bg-white px-3 py-2" /></label><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-lg border bg-white p-2" aria-label="Refresh recorded items"><RefreshCw size={18} /></button></div></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : !error && <form onSubmit={save} className="form-document form-frame ppe-list-form">
      <h3 className="text-center text-base font-bold">{PPE_TITLE}</h3><p className="mb-4 text-center text-sm">{ppePeriod(form)}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{field('lgu', 'LGU', 'text', true)}{field('fund', 'Fund')}{field('serialNumber', 'Serial No.', 'text', true)}{field('reportDate', 'Date', 'date', true)}</div>
      <TableScroll className="mt-4 overflow-x-auto"><table className="ppe-input-table w-full min-w-[900px] table-fixed border-collapse text-xs"><colgroup>{PPE_COLUMNS.map(([key, , width]) => <col key={key} style={{ width: `${width}%` }} />)}</colgroup><thead><tr><th colSpan={6}>To be filled up by the Supply and/or Property Division/Unit</th><th colSpan={2}>To be filled up by the Accounting Division/Unit</th></tr><tr>{PPE_COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{form.rows.length === 0 ? <tr><td colSpan={8} className="py-6">No items recorded for this month.</td></tr> : form.rows.map((row, index) => <tr key={`${row.source}-${row.sourceId}-${row.sourceRow ?? index}`}>{PPE_COLUMNS.map(([key]) => <td key={key} className="break-words" title={key === 'item' ? `${row.source}: ${row.sourceNumber || 'Recorded item'}` : undefined}>{key === 'amount' ? ppeAmount(row) : key === 'unitCost' ? money(row[key]) : row[key]}</td>)}</tr>)}</tbody><tfoot><tr><td colSpan={5} /><th>TOTAL</th><td /><td>{ppeTotal(form.rows)}</td></tr></tfoot></table></TableScroll>
      <section className="mt-5"><h3 className="mb-2 text-sm font-semibold">Recapitulation</h3><TableScroll className="overflow-x-auto"><table className="ppe-input-table w-full min-w-[800px] table-fixed border-collapse text-xs"><thead><tr>{recapColumns.map(([key, label]) => <th key={key} style={{ width: key === 'item' ? '36%' : undefined }}>{label}</th>)}</tr></thead><tbody>{form.recapitulation.map((row, index) => <tr key={index}>{recapColumns.map(([key]) => <td key={key} className="break-words">{['unitCost', 'totalCost'].includes(key) ? money(row[key]) : row[key]}</td>)}</tr>)}</tbody></table></TableScroll></section>
      <div className="mt-5 grid gap-4 md:grid-cols-[3fr_1fr]"><section className="border border-slate-400 p-3"><p className="mb-3 text-sm">I hereby certify to the correctness of the above information.</p>{field('custodian', 'Supply and/or Property Custodian')}<p className="mt-2 text-center text-xs">Signature over Printed Name of Supply<br />and/or Property Custodian</p></section><section className="border border-slate-400 p-3"><p className="mb-3 text-sm">Posted by:</p>{field('accountingStaff', 'Designated Accounting Staff')}{field('postedDate', 'Date', 'date')}</section></div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3"><button type="button" disabled={exporting || !form.rows.length} onClick={() => exportRecord(form, 'preview')} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">{exporting ? <Skeleton className="h-4 w-24" /> : <><Eye size={16} /> Print Preview</>}</button><RecordActionButton action="pdf" busy={exporting} disabled={exporting || !form.rows.length} onClick={() => exportRecord(form, 'download')} /><RecordActionButton action="print" busy={exporting} disabled={exporting || !form.rows.length} onClick={() => exportRecord(form, 'print')} />{canEdit && <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-white"><Save size={16} />{saving ? <Skeleton className="h-4 w-20" /> : isNewForm ? 'Save New Form' : 'Save Report Details'}</button>}</div>
    </form>}
    <section className="saved-records rounded-2xl border bg-white p-5"><h2 className="text-xl font-semibold">Saved Monthly Reports</h2><div className="mt-4 space-y-3">{records.length === 0 && !loading && !error && <p className="text-sm text-slate-500">Reports appear automatically when items are recorded.</p>}{records.slice((page - 1) * perPage, page * perPage).map(record => <div key={record._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><div className="font-semibold">{record.month} {record.automatic ? '(Automatic)' : '(Saved form)'}</div><div className="text-xs text-slate-600">{record.lgu} | {ppeDate(record.reportDate)} | {record.rows.length} items</div></div><div className="flex gap-2"><button type="button" onClick={() => { if (record.automatic) selectMonth(record.month); else { setIsNewForm(false); dirty.current = true; setMonth(record.month); setForm(record); } }} className="rounded-lg border px-3 py-1 text-xs">View</button><RecordActionButton action="pdf" busy={exporting} disabled={exporting} onClick={() => exportRecord(record, 'download')} /><RecordActionButton action="print" busy={exporting} disabled={exporting} onClick={() => exportRecord(record, 'print')} /></div></div>)}<Pagination page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={value => { setPerPage(value); setPage(1); }} /></div></section>
    {preview && <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 p-3" role="dialog" aria-modal="true" aria-label="Monthly Items Report print preview"><div className="flex items-center justify-between rounded-t-lg bg-white p-3"><span className="font-semibold">Print Preview - legal portrait</span><button type="button" aria-label="Close print preview" onClick={() => setPreview('')}><X size={20} /></button></div><iframe src={preview} title="Monthly Items Report PDF preview" className="min-h-0 flex-1 bg-white" /></div>}
  </div>;
}
