import { buildReportsPdf } from '../utils/reportsPdf';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, CalendarDays, FileText } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FORM_OPTIONS = [
  { value: 'IAR', label: 'Inspection and Acceptance Report', path: '/iar' },
  { value: 'PROPERTY CARD', label: 'Property Card', path: '/inventory' },
  { value: 'RIS', label: 'Requisition and Issue Slip', path: '/ris' },
  { value: 'ICS', label: 'Inventory Custodian Slip', path: '/inventory-custodian' },
  { value: 'PAR', label: 'Property Acknowledgement Receipt', path: '/par' },
  { value: 'PTR', label: 'Property Transfer Report', path: '/transfers' },
  { value: 'PRS', label: 'Property Return Slip', path: '/returns' },
  { value: 'RETURNED SUPPLY', label: 'Returned Supply', path: '/returned-supply' },
];

const formLabel = (value) => FORM_OPTIONS.find((option) => option.value === value)?.label || value;

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

export default function ReportsPage({ mode }) {
  const currentYear = new Date().getFullYear();
  const [records, setRecords] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(mode === 'annual');
  const [annualSummary, setAnnualSummary] = useState(null);
  const [form, setForm] = useState('ALL');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get('/reports/issued');
        setRecords(data.data || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load issued reports');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (mode !== 'annual') return undefined;
    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        const { data } = await axios.get('/reports/annual-summary', { params: { year } });
        setAnnualSummary(data.data || null);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load annual summary');
      } finally {
        setSummaryLoading(false);
      }
    };
    loadSummary();
    return undefined;
  }, [mode, year]);

  const years = useMemo(() => {
    const values = records.map((record) => new Date(record.reportDate).getFullYear()).filter(Number.isFinite);
    return [...new Set([currentYear, ...values])].sort((left, right) => right - left);
  }, [currentYear, records]);

  const forms = FORM_OPTIONS;

  const visibleRecords = useMemo(() => records.filter((record) => {
    const date = new Date(record.reportDate);
    if (form !== 'ALL' && record.type !== form) return false;
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year)) return false;
    return mode === 'annual' || date.getMonth() === Number(month);
  }), [form, mode, month, records, year]);

  const isAnnual = mode === 'annual';
  const title = isAnnual ? 'Annual Reports' : 'Monthly reports';
  const Icon = isAnnual ? BarChart3 : CalendarDays;
  const periodLabel = isAnnual ? String(year) : `${MONTHS[month]} ${year}`;
  const selectedFormLabel = form === 'ALL' ? 'All forms' : formLabel(form);
  const summaryCards = annualSummary ? [
    ['Received / purchased', `${annualSummary.acquired.quantity} items`],
    ['Available now', `${annualSummary.available.quantity} items`],
    ['Issued', `${annualSummary.issued.quantity} items`],
    ['Returned', `${annualSummary.returned.quantity} items`],
    ['Property / equipment records', `${visibleRecords.filter((record) => ['PROPERTY CARD', 'ICS', 'PAR'].includes(record.type)).length}`],
    ['Acquisition cost', `₱${Number(annualSummary.acquired.cost || 0).toLocaleString()}`],
    ['Unserviceable', `${annualSummary.unserviceable.quantity} items`],
    ['Damaged / missing', `${annualSummary.damagedOrMissing.quantity} items`],
  ] : [];

  const generatePdf = async (print = false) => {
    const pdfBytes = await buildReportsPdf({
      annual: isAnnual, title, periodLabel, year, monthName: MONTHS[month],
      records: visibleRecords, forms, selectedForm: form,
    });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    if (print) {
      const printWindow = window.open(url, '_blank');
      if (printWindow) printWindow.onload = () => printWindow.print();
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${isAnnual ? 'annual' : 'monthly'}-reports-${periodLabel.replace(/\s+/g, '-')}.pdf`;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (loading || (mode === 'annual' && summaryLoading)) return <PageSkeleton />;
 return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-700"><Icon size={18} /> Reports</div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">Issued reports recorded for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">Form<select value={form} onChange={(event) => setForm(event.target.value)} className="mt-1 block min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
            <option value="ALL">All forms</option>
            {forms.map((formOption) => <option key={formOption.value} value={formOption.value}>{formOption.label}</option>)}
          </select></label>
          {!isAnnual && (
            <label className="text-sm font-medium text-slate-600">Month<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
              {MONTHS.map((monthName, index) => <option key={monthName} value={index}>{monthName}</option>)}
            </select></label>
          )}
          <label className="text-sm font-medium text-slate-600">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <div className="flex gap-2">
            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf()} />
            <RecordActionButton action="print" title="Print report" onClick={() => generatePdf(true)} />
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {isAnnual && annualSummary && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Supply Office yearly summary</h2>
            <p className="text-sm text-slate-500">Yearly activity for {year}; availability and condition reflect the current inventory position.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(([label, value]) => <div key={label} className="minimal-surface px-4 py-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold text-slate-900">{value}</div></div>)}
          </div>
        </section>
      )}

      <div className="minimal-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText size={18} className="text-emerald-700" /> {selectedFormLabel} results</div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{loading ? <Skeleton className="h-4 w-20" /> : `${visibleRecords.length} report${visibleRecords.length === 1 ? '' : 's'}`}</span>
        </div>
        <TableScroll className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Report</th><th className="px-5 py-3">Document number</th><th className="px-5 py-3">Entity / office</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && visibleRecords.length === 0 && <tr><td colSpan="5" className="px-5 py-10 text-center text-slate-500">No {selectedFormLabel.toLowerCase()} results recorded for this period.</td></tr>}
              {visibleRecords.map((record) => <tr key={`${record.type}-${record.id}`} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-semibold text-slate-800">{formLabel(record.type)}</div><div className="text-xs text-slate-500">{record.title}</div></td><td className="px-5 py-4 font-medium text-slate-700">{record.documentNumber}</td><td className="px-5 py-4 text-slate-600">{record.entityName || '—'}</td><td className="px-5 py-4 text-slate-600">{formatDate(record.reportDate)}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{record.status}</span></td></tr>)}
            </tbody>
          </table>
        </TableScroll>
      </div>
    </div>
  );
}
