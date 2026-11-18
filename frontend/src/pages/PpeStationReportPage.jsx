import FormField from '../components/FormField';
import { formNumber, formNumberValue } from '../utils/formNumbers';
import FormRecordTabs from '../components/FormRecordTabs';
import SearchInput from '../components/SearchInput';
import SignatoryValue from '../components/SignatoryValue';
import { hasRowData } from '../utils/formRows';
import ValidatedForm from '../components/ValidatedForm';
import NewFormBadge from '../components/NewFormBadge';
import FormEditorHeader from '../components/FormEditorHeader';
import SavedReportsHeader, { filterReportsByPoAndItem } from '../components/SavedReportsHeader';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PDFDocument } from 'pdf-lib';
import { Eye, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RecordActionButton from '../components/RecordActionButton';
import Pagination from '../components/Pagination';
import { buildStationPpePdf, STATION_PPE_COLUMNS, stationDate, stationMoney } from '../utils/ppeStationPdf';
import { createFormPdfCache } from '../utils/formPdfCache';
import { sortSavedReports } from '../utils/savedReportOrder';
import useSavedReportPage from '../utils/useSavedReportPage';

const signatoryFields = ['preparedBy', 'preparedDesignation', 'reviewedBy', 'reviewedDesignation'];
const inputColumnWidths = { article: 11, description: 24, propertyNumber: 14, accountablePerson: 17, unitCost: 10, totalCost: 10, remarks: 14 };
const getStationPpePdf = createFormPdfCache(({ details }) => buildStationPpePdf(details));
const blankRow = () => ({ article: '', description: '', propertyNumber: '', accountablePerson: '', unitCost: '', totalCost: '', remarks: '' });
const blankForm = defaults => ({ condition: 'Serviceable', accountGroup: '', governmentUnit: 'LOCAL GOVERNMENT UNIT OF CARIGARA', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), preparedBy: '', preparedDesignation: '', reviewedBy: '', reviewedDesignation: '', ...defaults, rows: [] });
const matchesCondition = (row, condition) => condition === 'Unserviceable'
  ? String(row.remarks || '').trim().toLowerCase() === 'unserviceable'
  : String(row.remarks || '').trim().toLowerCase() !== 'unserviceable';

export default function PpeStationReportPage() {
  const location = useLocation();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [form, setForm] = useState(() => blankForm({}));
  const reportTitle = `List of PPEs - ${form.condition}`;
  const defaults = useRef({});
  const [records, setRecords] = useState([]);
  const [itemGroups, setItemGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState('');
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
  const [recentlySavedId, setRecentlySavedId] = useState(null);
  const [selectedReportIds, setSelectedReportIds] = useState([]);
  const routeCondition = location.pathname.endsWith('/unserviceable') ? 'Unserviceable' : 'Serviceable';
  const filteredReports = sortSavedReports(filterReportsByPoAndItem(records.filter(record => (record.condition || 'Serviceable') === routeCondition), search));
  const selectedReports = filteredReports.filter(record => selectedReportIds.includes(record._id));
  const selectableReportIds = filteredReports.map(record => record._id);
  const allSelectableReportsSelected = selectableReportIds.length > 0 && selectableReportIds.every(id => selectedReportIds.includes(id));
  useSavedReportPage(filteredReports, recentlySavedId, perPage, setPage);
  useEffect(() => {
    setPage(1);
    setEditingId(null);
    setForm(previous => ({ ...previous, condition: routeCondition, accountGroup: '', rows: [] }));
  }, [routeCondition]);
  const dirtySignatories = useRef({});
  const rememberQueue = useRef(Promise.resolve());
  const editor = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/ppe-station-reports', { signal: controller.signal }).then(({ data }) => {
      defaults.current = data.data.defaults; setForm({ ...blankForm(data.data.defaults), condition: routeCondition }); setRecords(data.data.records); setLoading(false);
    }).catch(err => { if (!controller.signal.aborted) { setError(err.response?.data?.message || 'Unable to load PPE reports.'); setLoading(false); } });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/ppe-station-reports/item-groups', { signal: controller.signal })
      .then(({ data }) => { setItemGroups(data.data || []); setGroupsLoading(false); })
      .catch(err => { if (!controller.signal.aborted) { setGroupsError(err.response?.data?.message || 'Unable to load PPE item groups.'); setGroupsLoading(false); } });
    return () => controller.abort();
  }, []);
  const selectAccountGroup = value => {
    const query = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const groupsForCondition = itemGroups.map(group => ({ ...group, rows: group.rows.filter(row => matchesCondition(row, routeCondition)) })).filter(group => group.rows.length);
    const exact = groupsForCondition.find(group => group.key === query);
    const matches = query ? exact ? [exact] : groupsForCondition.filter(group => group.key.includes(query)) : [];
    setForm(previous => ({ ...previous, condition: routeCondition, accountGroup: value, rows: matches.flatMap(group => group.rows.map(row => ({ ...row }))) }));
  };
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
  const edit = record => {
    setEditorOpen(true); setEditingId(record._id); setForm({ ...record, rows: record.rows.map(row => ({ ...row })) });
    editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const save = async event => {
    event.preventDefault(); setSaving(true); setRecentlySavedId(null);
    try {
      await remember();
      const payload = { ...form, rows: form.rows.filter(row => hasRowData(row, blankRow())).map(row => ({ ...row, unitCost: row.unitCost === '' ? null : row.unitCost, totalCost: row.totalCost === '' ? null : row.totalCost })) };
      const { data } = editingId ? await axios.put(`/ppe-station-reports/${editingId}`, payload) : await axios.post('/ppe-station-reports', payload);
      setRecords(previous => [data.data, ...previous.filter(record => record._id !== data.data._id)]);
      setRecentlySavedId(data.data._id);
      setSearch('');
      setEditingId(null); setForm({ ...blankForm(defaults.current), condition: routeCondition });
      setEditorOpen(false);
      toast.success('List of PPEs saved');
    } catch (err) { toast.error(err.response?.data?.message || 'Unable to save PPE report.'); }
    finally { setSaving(false); }
  };
  const printReports = async selected => {
    if (!selected.length) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return toast.error('Allow pop-ups to open the printable report.');
    setExporting(true);
    try {
      const combined = await PDFDocument.create();
      for (const record of selected) {
        const details = { ...record, reportTitle: `List of PPEs - ${record.condition || 'Serviceable'}` };
        const source = await PDFDocument.load(await getStationPpePdf({ type: 'PPE STATION', details }));
        const pages = await combined.copyPages(source, source.getPageIndices());
        pages.forEach(page => combined.addPage(page));
      }
      const url = URL.createObjectURL(new Blob([await combined.save()], { type: 'application/pdf' }));
      printWindow.document.title = 'Selected PPE Lists - Print';
      const frame = printWindow.document.createElement('iframe'); frame.title = 'Selected PPE lists printable report';
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'; frame.src = url;
      frame.onload = () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* The PDF viewer also includes a print control. */ }
      };
      printWindow.document.body.appendChild(frame);
      printWindow.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
    } catch (err) { printWindow.close(); toast.error(err.message || 'Unable to generate PPE report.'); }
    finally { setExporting(false); }
  };
  const exportRecord = async (record, mode) => {
    if (mode === 'print') return printReports([record]);
    setExporting(true);
    try {
      const exportRecordData = { ...record, reportTitle: `List of PPEs - ${record.condition || 'Serviceable'}` };
      const url = URL.createObjectURL(new Blob([await getStationPpePdf({ type: 'PPE STATION', details: exportRecordData })], { type: 'application/pdf' }));
      if (mode === 'preview') setPreview(url);
      else {
        const link = document.createElement('a'); link.href = url; link.download = `List-of-PPEs-${record.condition || 'Serviceable'}-${record.accountGroup.replace(/[^a-zA-Z0-9_-]/g, '-')}-${record.date}.pdf`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) { toast.error(err.message || 'Unable to generate PPE report.'); }
    finally { setExporting(false); }
  };
  const field = (key, label, type = 'text', required = true) => signatoryFields.includes(key) ? <FormField className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><SignatoryValue formType="ppe" role={key.startsWith('prepared') ? 'preparedBy' : 'reviewedBy'} field={key.endsWith('Designation') ? 'designation' : 'name'} value={form[key]} managed={!editingId} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} aria-label={label} /></FormField> : <FormField className="block text-sm"><span className="mb-1 block font-semibold">{label}</span><input type={type} required={required} value={form[key]} maxLength={key === 'governmentUnit' ? 300 : 200} onChange={event => update(key, event.target.value)} onBlur={signatoryFields.includes(key) ? () => { if (Object.hasOwn(dirtySignatories.current, key)) remember({ [key]: dirtySignatories.current[key] }).catch(() => toast.error('Unable to remember signatory. Save the report to retry.')); } : undefined} className="w-full border px-2 py-1" /></FormField>;
  const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
  if (loading) return <PageSkeleton />;
 return <div className="space-y-6">
    <FormRecordTabs label={reportTitle} recordsLabel="Saved Reports" showForm={editorOpen} onForm={() => setEditorOpen(true)} onRecords={() => setEditorOpen(false)} />
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {!editorOpen && (<section className="saved-records rounded-2xl border bg-white p-5"><SavedReportsHeader title={`List of PPEs - ${routeCondition}`} searchPlaceholder="Search PO/JO No. or item name" search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}></SavedReportsHeader><div className="mt-4 space-y-3">{!loading && filteredReports.length === 0 && <p className="text-sm text-slate-500">No {routeCondition.toLowerCase()} PPE lists saved yet.</p>}{filteredReports.slice((page - 1) * perPage, page * perPage).map(record => <div key={record._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`Select ${record.accountGroup} PPE report for printing`} checked={selectedReportIds.includes(record._id)} disabled={exporting} onChange={event => setSelectedReportIds(previous => event.target.checked ? [...new Set([...previous, record._id])] : previous.filter(id => id !== record._id))} /><span>Select</span></label><div><div className="font-semibold">{record.accountGroup}</div><div className="text-xs text-slate-600">{stationDate(record.date)} | {record.rows.length} PPE rows</div></div></div><NewFormBadge record={record} /><div className="flex gap-2">{canEdit && <RecordActionButton action="edit" onClick={() => edit(record)} />}<RecordActionButton action="pdf" busy={exporting} disabled={exporting} onClick={() => exportRecord(record, 'download')} /></div></div>)}<Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={value => { setPerPage(value); setPage(1); }} rightContent={<><label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" aria-label="Select all printable PPE reports" checked={allSelectableReportsSelected} disabled={!selectableReportIds.length || exporting} onChange={event => setSelectedReportIds(previous => event.target.checked ? [...new Set([...previous, ...selectableReportIds])] : previous.filter(id => !selectableReportIds.includes(id)))} /><span>Select all</span></label><button type="button" disabled={exporting || !selectedReports.length} onClick={() => printReports(selectedReports)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{exporting ? 'Preparing…' : `Print selected (${selectedReports.length})`}</button></>} /></div></section>)}
    {loading ? <Skeleton className="h-4 w-20" /> : canEdit && editorOpen && !error && <ValidatedForm ref={editor} onSubmit={save} aria-busy={saving} inert={saving ? true : undefined} className="form-document form-frame ppe-station-form">
      <FormEditorHeader title={reportTitle} description="Record office equipment and the person accountable for each item." onClose={() => setEditorOpen(false)} />
      <p className="text-center text-sm">Republic of the Philippines</p><div className="my-2">{field('governmentUnit', 'Local Government Unit', 'text', true)}</div>
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">List of PPEs - {routeCondition}</p>
      <div className="grid gap-3 sm:grid-cols-2"><FormField className="block text-sm"><span className="mb-1 block font-semibold">PPE Account Group <span className="text-red-600" aria-hidden="true">*</span></span><SearchInput aria-label="PPE Account Group" required disabled={groupsLoading || !!groupsError} maxLength={200} value={form.accountGroup} options={itemGroups.filter(group => group.rows.some(row => matchesCondition(row, routeCondition))).map(group => ({ value: group.key, label: group.name }))} onChange={selectAccountGroup} placeholder={groupsLoading ? 'Loading item groups…' : 'Search an item, e.g. Printer'} className="w-full border px-2 py-1" /></FormField>{field('date', 'Date', 'date', true)}</div>
      {groupsError && <p role="alert" className="mt-2 text-sm text-rose-700">{groupsError}</p>}
      {form.accountGroup.trim() && <p role="status" className="mt-2 text-sm text-slate-600">{form.rows.length ? `${form.rows.length} records in this PPE group.` : 'No matching equipment records found.'}</p>}
      <TableScroll className="mt-4 overflow-x-auto"><table className="ppe-input-table w-full min-w-[900px] table-fixed border-collapse text-xs"><colgroup>{STATION_PPE_COLUMNS.map(([key]) => <col key={key} style={{ width: `${inputColumnWidths[key] * 0.95}%` }} />)}</colgroup><thead><tr>{STATION_PPE_COLUMNS.map(([key, label]) => <th key={key}>{label} {!['remarks', 'unitCost', 'totalCost'].includes(key) && <span className="required-marker text-red-600" aria-hidden="true">*</span>}</th>)}</tr></thead><tbody>{form.rows.map((row, index) => <tr key={index}>{STATION_PPE_COLUMNS.map(([key, label]) => <td key={key}><div aria-label={`${label}, row ${index + 1}`} className={`min-h-9 whitespace-pre-wrap break-words px-2 py-2 ${['unitCost', 'totalCost'].includes(key) ? 'text-center tabular-nums' : ''}`}>{['unitCost', 'totalCost'].includes(key) ? stationMoney(row[key]) : formNumberValue(key, row[key]) || ''}</div></td>)}</tr>)}</tbody></table></TableScroll>
      <div className="mt-5 grid gap-5 border border-slate-400 p-4 md:grid-cols-[3fr_2fr]"><section><p className="mb-3 font-semibold">Prepared by:</p>{field('preparedBy', 'Name')}{field('preparedDesignation', 'Designation')}<p className="mt-3 text-xs">Date: {stationDate(form.date)}</p></section><section><p className="mb-3 font-semibold">Reviewed by:</p>{field('reviewedBy', 'Name')}{field('reviewedDesignation', 'Designation')}</section></div>
      <p className="mt-2 text-xs text-slate-500">Signatories are managed in System Settings.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={exporting} onClick={() => exportRecord(form, 'preview')} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2">{exporting ? <Skeleton className="h-4 w-24" /> : <><Eye size={16} /> Print Preview</>}</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-white"><Save size={16} />Save</button></div>
    </ValidatedForm>}

    {preview && <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 p-3" role="dialog" aria-modal="true" aria-label="List of PPEs print preview"><div className="flex items-center justify-between rounded-t-lg bg-white p-3"><span className="font-semibold">Print Preview - A4 landscape</span><button type="button" aria-label="Close PPE preview" onClick={() => setPreview('')}><X size={20} /></button></div><iframe src={preview} title="List of PPEs PDF preview" className="min-h-0 flex-1 bg-white" /></div>}
  </div>;
}
