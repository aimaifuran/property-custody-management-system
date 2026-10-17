import RecordFormPreview from '../components/RecordFormPreview';
import Skeleton from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getOfficialFormPdf } from '../utils/formPdfCache';
import toast from 'react-hot-toast';
import { ArrowLeft, Folder, FileText, Search, X } from 'lucide-react';

const RECORD_TYPES = [
  ['IAR', 'Inspection and Acceptance Report'],
  ['PROPERTY CARD', 'Property Card'],
  ['RIS', 'Requisition and Issue Slip'],
  ['ICS', 'Inventory Custodian Slip'],
  ['PAR', 'Property Acknowledgement Receipt'],
  ['PTR', 'Property Transfer Report'],
  ['PRS', 'Property Return Slip'],
  ['RETURNED SUPPLY', 'Returned Supply'],
  ['PPE STATION', 'List of PPEs'],
  ['MONTHLY REPORT', 'Monthly Reports'],
];

const YEARS = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - index);
const typeLabel = (type) => RECORD_TYPES.find(([value]) => value === type)?.[1] || type;
const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(); };

export default function HistoricalRecordsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [type, setType] = useState(null);
  const [folderSearches, setFolderSearches] = useState({});
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await axios.get('/reports/archive', { params: { year, type: 'ALL' }, signal: controller.signal });
        if (!controller.signal.aborted) setRecords(data.data || []);
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.response?.data?.message || 'Unable to load historical records');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    const timer = window.setTimeout(load, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [year]);

  const search = folderSearches[type] || '';
  const visibleRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records.filter(record => record.type === type && (!keyword || JSON.stringify(record).toLowerCase().includes(keyword)));
  }, [records, type, search]);

  const transactionHistory = useMemo(() => {
    if (!selected) return [];
    const detail = selected.details || {};
    const identifiers = [selected.documentNumber, detail.propertyNumber, detail.description, detail.serialNumber].filter(Boolean).map(String).map((value) => value.toLowerCase());
    return records.filter((record) => record.id !== selected.id && identifiers.some((identifier) => JSON.stringify(record.details || {}).toLowerCase().includes(identifier)));
  }, [records, selected]);

  const downloadRecord = async () => {
    if (!selected) return;
    setExporting(true);
    try {
      const bytes = await getOfficialFormPdf(selected);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected.type}-${selected.documentNumber || selected.id}.pdf`.replace(/[<>:"/\\|?*]/g, '-');
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { toast.error(error.message || 'Unable to generate the form PDF'); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="minimal-surface flex flex-wrap gap-4 p-4">
        <label className="text-sm font-medium text-slate-600">Year<select value={year} onChange={event => setYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">{YEARS.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {!type ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RECORD_TYPES.map(([value, label]) => {
          const count = records.filter(record => record.type === value).length;
          return <button key={value} type="button" onClick={() => setType(value)} className="archive-folder minimal-surface flex items-center justify-start gap-4 p-5 text-left transition hover:ring-2 hover:ring-emerald-300">
            <Folder size={38} className="shrink-0 text-amber-600" />
            <div><h2 className="font-semibold text-slate-900">{label}</h2><p className="mt-1 text-sm text-slate-500">{year} &middot; {loading ? 'Loading records...' : `${count} file${count === 1 ? '' : 's'}`}</p></div>
          </button>;
        })}
      </div> : <section className="minimal-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div><button type="button" onClick={() => setType(null)} className="mb-3 inline-flex items-center gap-2 text-sm text-emerald-700"><ArrowLeft size={16} /> All form folders</button><h2 className="flex items-center gap-2 font-semibold"><Folder size={22} className="text-amber-600" />{typeLabel(type)}</h2><p className="mt-1 text-sm text-slate-500">{year} ? {visibleRecords.length} file{visibleRecords.length === 1 ? '' : 's'}</p></div>
          <label className="block w-full text-sm font-medium text-slate-600 sm:w-80">Search this folder<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={event => setFolderSearches(previous => ({ ...previous, [type]: event.target.value }))} placeholder="Item, document, office, or employee" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 font-normal text-slate-900" /></div></label>
        </div>
        <TableScroll label={`${typeLabel(type)} files`}><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Document number', 'Item / office', 'Employee / end user', 'Date', 'Details'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
          {loading && <tr><td colSpan={5} className="p-5"><Skeleton className="h-5 w-full" label="Loading folder records" /></td></tr>}
          {!loading && !visibleRecords.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">{search ? 'No files match your search in this folder.' : 'No records saved in this folder for the selected year.'}</td></tr>}
          {!loading && visibleRecords.map(record => <tr key={`${record.type}-${record.id}`} className="hover:bg-slate-50"><td className="px-5 py-4"><span className="inline-flex items-center gap-2 font-medium"><FileText size={16} className="text-emerald-700" />{record.documentNumber}</span></td><td className="px-5 py-4">{record.entityName || '?'}</td><td className="px-5 py-4">{record.employee || '?'}</td><td className="px-5 py-4">{formatDate(record.reportDate)}</td><td className="px-5 py-4"><button type="button" onClick={() => setSelected(record)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">Open file</button></td></tr>)}
        </tbody></table></TableScroll>
      </section>}

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{typeLabel(selected.type)}</div><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.documentNumber}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(selected.reportDate)} · {selected.entityName || 'No office recorded'} · {selected.employee || 'No end user recorded'}</p></div><button type="button" title="Close record" onClick={() => setSelected(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-5 flex gap-2"><RecordActionButton action="pdf" onClick={downloadRecord} busy={exporting} /></div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)]"><section className="min-w-0"><h3 className="mb-3 font-semibold">Official form preview</h3><RecordFormPreview record={selected} /></section><section><h3 className="text-sm font-semibold text-slate-800">Transaction history</h3>{transactionHistory.length === 0 ? <p className="mt-2 text-sm text-slate-500">No related transactions found in the selected year.</p> : <div className="mt-2 space-y-2">{transactionHistory.map((record) => <button type="button" key={`${record.type}-${record.id}`} onClick={() => setSelected(record)} className="transaction-history-entry block w-full rounded-lg border border-slate-200 p-3 text-left hover:border-emerald-300"><div className="text-sm font-semibold text-slate-800">{typeLabel(record.type)}</div><div className="text-xs text-slate-500">{record.documentNumber} · {formatDate(record.reportDate)}</div></button>)}</div>}</section></div></div></div>}
    </div>
  );
}
