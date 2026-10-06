import FormEditorHeader from '../components/FormEditorHeader';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Eye, Plus, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RecordActionButton from '../components/RecordActionButton';
import Pagination from '../components/Pagination';
import { buildStationPpePdf, STATION_PPE_COLUMNS, stationDate } from '../utils/ppeStationPdf';

const signatoryFields = ['preparedBy', 'preparedDesignation', 'reviewedBy', 'reviewedDesignation'];
const blankRow = () => ({ article: '', description: '', propertyNumber: '', accountablePerson: '', unitCost: '', totalCost: '', remarks: '' });
const blankForm = defaults => ({ accountGroup: '', governmentUnit: 'LOCAL GOVERNMENT UNIT OF CARIGARA', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), preparedBy: '', preparedDesignation: '', reviewedBy: '', reviewedDesignation: '', ...defaults, rows: [blankRow()] });

export default function PpeStationReportPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [form, setForm] = useState(() => blankForm({}));
  const defaults = useRef({});
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(records, search);
  const dirtySignatories = useRef({});
  const rememberQueue = useRef(Promise.resolve());
  const editor = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/ppe-station-reports', { signal: controller.signal }).then(({ data }) => {
      defaults.current = data.data.defaults; setForm(blankForm(data.data.defaults)); setRecords(data.data.records); setLoading(false);
    }).catch(err => { if (!controller.signal.aborted) { setError(err.response?.data?.message || 'Unable to load PPE reports.'); setLoading(false); } });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const update = (key, value) => {
    if (signatoryFields.includes(key)) dirtySignatories.current[key] = value;
    setForm(previous => ({ ...previous, [key]: value }));
  };
  const remember = (values = { ...dirtySignatories.current }) => {
    if (!Object.keys(values).length) return rememberQueue.current;
    const task = rememberQueue.current.catch(() => {}).then(async () => {
      await axios.patch('/ppe-station-reports/signatories', values);
      defaults.current = { ...defaults.current, ...values };
      Object.entries(values).forEach(([key, value]) => { if (dirtySignatories.current[key] === value) delete dirtySignatories.current[key]; });
    });
    rememberQueue.current = task;
    return task;
  };
  const reset = () => { setEditorOpen(true); setEditingId(null); setForm(blankForm({ ...defaults.current, ...dirtySignatories.current })); };
  const edit = record => {
    setEditorOpen(true); setEditingId(record._id); setForm({ ...record, rows: record.rows.map(row => ({ ...row, unitCost: row.unitCost ?? '', totalCost: row.totalCost ?? '' })) });
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const save = async event => {
    event.preventDefault(); setSaving(true);
    try {
      await remember();
      const payload = { ...form, rows: form.rows.map(row => ({ ...row, unitCost: row.unitCost === '' ? null : Number(row.unitCost), totalCost: row.totalCost === '' ? null : Number(row.totalCost) })) };
      const { data } = editingId ? await axios.put(`/ppe-station-reports/${editingId}`, payload) : await axios.post('/ppe-station-reports', payload);
      setRecords(previous => [data.data, ...previous.filter(record => record._id !== data.data._id)]);
      setEditingId(null); setForm(blankForm(defaults.current)); setPage(1);
      toast.success('List of PPEs saved');
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to save PPE report.'); }
    finally { setSaving(false); }
  };
  const exportRecord = async (record, mode) => {
    const printWindow = mode === 'print' ? window.open('', '_blank') : null;
    if (mode === 'print' && !printWindow) return toast.error('Allow pop-ups to open the printable report.');
    setExporting(true);
    try {
      const url = URL.createObjectURL(new Blob([await buildStationPpePdf(record)], { type: 'application/pdf' }));
      if (mode === 'preview') setPreview(url);
      else if (mode === 'print') {
        printWindow.document.title = 'List of PPEs - Print';
        const frame = printWindow.document.createElement('iframe'); frame.title = 'List of PPEs printable report';
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'; frame.src = url;
        frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* The PDF viewer also includes a print control. */ } };
        printWindow.document.body.appendChild(frame); printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
      } else {
        const link = document.createElement('a'); link.href = url; link.download = `List-of-PPEs-${record.accountGroup.replace(/[^a-zA-Z0-9_-]/g, '-')}-${record.date}.pdf`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) { printWindow?.close(); toast.error(err.message || 'Unable to generate PPE report.'); }
    finally { setExporting(false); }
  };
  const field = (key, label, type = 'text', required = false) => <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><input type={type} required={required} value={form[key]} maxLength={key === 'governmentUnit' ? 300 : 200} onChange={event => update(key, event.target.value)} onBlur={signatoryFields.includes(key) ? () => { if (Object.hasOwn(dirtySignatories.current, key)) remember({ [key]: dirtySignatories.current[key] }).catch(() => toast.error('Unable to remember signatory. Save the report to retry.')); } : undefined} className="w-full border px-2 py-1" /></label>;
  const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">List of PPEs</h1><p className="mt-1 text-sm text-slate-600">List of PPEs Found at Station. Print on A4 paper in landscape orientation.</p></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading ? <Skeleton className="h-4 w-20" /> : canEdit && editorOpen && !error && <form ref={editor} onSubmit={save} className="form-document form-frame ppe-station-form">
      <FormEditorHeader title="List of PPEs Found at Station" description="Record office equipment and the person accountable for each item." onClose={() => setEditorOpen(false)} />
      <p className="text-center text-sm">Republic of the Philippines</p><div className="my-2">{field('governmentUnit', 'Local Government Unit', 'text', true)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{field('accountGroup', 'PPE Account Group', 'text', true)}{field('date', 'Date', 'date', true)}</div>
      <TableScroll className="mt-4 overflow-x-auto"><table className="ppe-input-table w-full min-w-[1100px] table-fixed border-collapse text-xs"><colgroup>{STATION_PPE_COLUMNS.map(([key, , width]) => <col key={key} style={{ width: `${width}%` }} />)}</colgroup><thead><tr>{STATION_PPE_COLUMNS.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{form.rows.map((row, index) => <tr key={index}>{STATION_PPE_COLUMNS.map(([key, label]) => <td key={key}>{['unitCost', 'totalCost'].includes(key) ? <input aria-label={`${label}, row ${index + 1}`} type="number" min={0} step="0.01" value={row[key]} onChange={event => setForm(previous => ({ ...previous, rows: previous.rows.map((entry, rowIndex) => rowIndex === index ? { ...entry, [key]: event.target.value } : entry) }))} /> : <textarea aria-label={`${label}, row ${index + 1}`} required={['article', 'description'].includes(key)} maxLength={{ article: 100, description: 1500, propertyNumber: 300, accountablePerson: 200, remarks: 300 }[key]} value={row[key] || ''} rows={key === 'description' ? 3 : 2} onChange={event => setForm(previous => ({ ...previous, rows: previous.rows.map((entry, rowIndex) => rowIndex === index ? { ...entry, [key]: event.target.value } : entry) }))} />}</td>)}</tr>)}</tbody></table></TableScroll>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={form.rows.length >= 500} onClick={() => setForm(previous => ({ ...previous, rows: [...previous.rows, blankRow()] }))} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm"><Plus size={16} /> Add PPE</button><label className="text-xs">Remove row <select defaultValue="" disabled={form.rows.length === 1} onChange={event => { const index = Number(event.target.value); setForm(previous => ({ ...previous, rows: previous.rows.filter((_, rowIndex) => rowIndex !== index) })); event.target.value = ''; }}><option value="" disabled>Select row</option>{form.rows.map((row, index) => <option key={index} value={index}>Row {index + 1}: {row.article || 'Blank'}</option>)}</select></label></div>
      <div className="mt-5 grid gap-5 border border-slate-400 p-4 md:grid-cols-[3fr_2fr]"><section><p className="mb-3 font-semibold">Prepared by:</p>{field('preparedBy', 'Name')}{field('preparedDesignation', 'Designation')}<p className="mt-3 text-xs">Date: {stationDate(form.date)}</p></section><section><p className="mb-3 font-semibold">Reviewed by:</p>{field('reviewedBy', 'Name')}{field('reviewedDesignation', 'Designation')}</section></div>
      <p className="mt-2 text-xs text-slate-500">Signatory changes are remembered automatically for new reports.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={exporting} onClick={() => exportRecord(form, 'preview')} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">{exporting ? <Skeleton className="h-4 w-24" /> : <><Eye size={16} /> Print Preview</>}</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-white"><Save size={16} />{saving ? <Skeleton className="h-4 w-20" /> : 'Save List of PPEs'}</button></div>
    </form>}
    <section className="saved-records rounded-2xl border bg-white p-5"><SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}>{canEdit && <NewFormButton onNew={reset} editorRef={editor} />}</SavedReportsHeader><div className="mt-4 space-y-3">{!loading && records.length === 0 && <p className="text-sm text-slate-500">No PPE lists saved yet.</p>}{filteredReports.slice((page - 1) * perPage, page * perPage).map(record => <div key={record._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><div className="font-semibold">{record.accountGroup}</div><div className="text-xs text-slate-600">{stationDate(record.date)} | {record.rows.length} PPE rows</div></div><div className="flex gap-2">{canEdit && <RecordActionButton action="edit" onClick={() => edit(record)} />}<RecordActionButton action="pdf" busy={exporting} disabled={exporting} onClick={() => exportRecord(record, 'download')} /><RecordActionButton action="print" busy={exporting} disabled={exporting} onClick={() => exportRecord(record, 'print')} /></div></div>)}<Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={value => { setPerPage(value); setPage(1); }} /></div></section>
    {preview && <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 p-3" role="dialog" aria-modal="true" aria-label="List of PPEs print preview"><div className="flex items-center justify-between rounded-t-lg bg-white p-3"><span className="font-semibold">Print Preview - A4 landscape</span><button type="button" aria-label="Close PPE preview" onClick={() => setPreview('')}><X size={20} /></button></div><iframe src={preview} title="List of PPEs PDF preview" className="min-h-0 flex-1 bg-white" /></div>}
  </div>;
}
