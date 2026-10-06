import RecordFormPreview from '../components/RecordFormPreview';
import Skeleton from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getOfficialFormPdf } from '../utils/formPdfCache';
import toast from 'react-hot-toast';
import { Archive, Download, FileText, Search, X } from 'lucide-react';

const RECORD_TYPES = [
  ['ALL', 'All record types'],
  ['IAR', 'Inspection and Acceptance Report'],
  ['PROPERTY CARD', 'Property Card'],
  ['RIS', 'Requisition and Issue Slip'],
  ['ICS', 'Inventory Custodian Slip'],
  ['PAR', 'Property Acknowledgement Receipt'],
  ['PTR', 'Property Transfer Report'],
  ['PRS', 'Property Return Slip'],
  ['RETURNED SUPPLY', 'Returned Supply'],
];

const YEARS = Array.from({ length: 11 }, (_, index) => new Date().getFullYear() - index);
const typeLabel = (type) => RECORD_TYPES.find(([value]) => value === type)?.[1] || type;
const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(); };

export default function HistoricalRecordsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [type, setType] = useState('ALL');
  const [condition, setCondition] = useState('ALL');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await axios.get('/reports/archive', { params: { year, type, condition, search } });
        setRecords(data.data || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load historical records');
      } finally {
        setLoading(false);
      }
    };
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [condition, search, type, year]);

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
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-700"><Archive size={18} /> Records archive</div>
        <h1 className="text-2xl font-semibold text-slate-900">Historical Records</h1>
        <p className="mt-1 text-sm text-slate-500">Access previous-year supply and property records without creating duplicates.</p>
      </div>

      <div className="minimal-surface grid gap-3 p-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-600">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">{YEARS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-600">Record type<select value={type} onChange={(event) => setType(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">{RECORD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-600">Condition<select value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900"><option value="ALL">All conditions</option><option value="SERVICEABLE">Serviceable</option><option value="UNSERVICEABLE">Unserviceable</option><option value="MISSING">Missing / lost</option></select></label>
        <label className="text-sm font-medium text-slate-600">Search item, number, office, or employee<div className="relative mt-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search archive" className="block w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 font-normal text-slate-900" /></div></label>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="minimal-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText size={18} className="text-emerald-700" /> {year} records</div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{loading ? <Skeleton className="h-4 w-20" /> : `${records.length} record${records.length === 1 ? '' : 's'}`}</span></div>
        <TableScroll className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Record type</th><th className="px-5 py-3">Document number</th><th className="px-5 py-3">Item / office</th><th className="px-5 py-3">Employee / end user</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-slate-100">{loading && Array.from({ length: 5 }, (_, index) => <tr key={`skeleton-${index}`}><td colSpan="6" className="px-5 py-4"><Skeleton className="h-5 w-full" label="Loading historical records" /></td></tr>)}{!loading && records.length === 0 && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No historical records match these filters.</td></tr>}{!loading && records.map((record) => <tr key={`${record.type}-${record.id}`} className="hover:bg-slate-50"><td className="px-5 py-4 font-semibold text-slate-800">{typeLabel(record.type)}</td><td className="px-5 py-4 font-medium text-slate-700">{record.documentNumber}</td><td className="px-5 py-4 text-slate-600">{record.entityName || '—'}</td><td className="px-5 py-4 text-slate-600">{record.employee || '—'}</td><td className="px-5 py-4 text-slate-600">{formatDate(record.reportDate)}</td><td className="px-5 py-4"><button type="button" onClick={() => setSelected(record)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">View record</button></td></tr>)}</tbody></table></TableScroll>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="max-h-[90vh] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{typeLabel(selected.type)}</div><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.documentNumber}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(selected.reportDate)} · {selected.entityName || 'No office recorded'} · {selected.employee || 'No end user recorded'}</p></div><button type="button" title="Close record" onClick={() => setSelected(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-5 flex gap-2"><RecordActionButton action="pdf" onClick={downloadRecord} busy={exporting} /></div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)]"><section className="min-w-0"><h3 className="mb-3 font-semibold">Official form preview</h3><RecordFormPreview record={selected} /></section><section><h3 className="text-sm font-semibold text-slate-800">Transaction history</h3>{transactionHistory.length === 0 ? <p className="mt-2 text-sm text-slate-500">No related transactions found in the selected year.</p> : <div className="mt-2 space-y-2">{transactionHistory.map((record) => <button type="button" key={`${record.type}-${record.id}`} onClick={() => setSelected(record)} className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:border-emerald-300"><div className="text-sm font-semibold text-slate-800">{typeLabel(record.type)}</div><div className="text-xs text-slate-500">{record.documentNumber} · {formatDate(record.reportDate)}</div></button>)}</div>}</section></div></div></div>}
    </div>
  );
}
