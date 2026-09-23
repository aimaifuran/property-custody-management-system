import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { BarChart3, CalendarDays, Download, FileText, Printer } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

export default function ReportsPage({ mode }) {
  const currentYear = new Date().getFullYear();
  const [records, setRecords] = useState([]);
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

  const years = useMemo(() => {
    const values = records.map((record) => new Date(record.reportDate).getFullYear()).filter(Number.isFinite);
    return [...new Set([currentYear, ...values])].sort((left, right) => right - left);
  }, [currentYear, records]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const date = new Date(record.reportDate);
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year)) return false;
    return mode === 'annual' || date.getMonth() === Number(month);
  }), [mode, month, records, year]);

  const isAnnual = mode === 'annual';
  const title = isAnnual ? 'Annual Reports' : 'Monthly reports';
  const Icon = isAnnual ? BarChart3 : CalendarDays;
  const periodLabel = isAnnual ? String(year) : `${MONTHS[month]} ${year}`;

  const generatePdf = async (print = false) => {
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    let page = pdfDoc.addPage([595, 842]);
    let y = 790;

    const addPageIfNeeded = () => {
      if (y < 60) {
        page = pdfDoc.addPage([595, 842]);
        y = 790;
      }
    };

    page.drawText('Property Accountability Management System', { x: 40, y, size: 14, font: boldFont, color: rgb(0.18, 0.43, 0.40) });
    y -= 24;
    page.drawText(`${title} - ${periodLabel}`, { x: 40, y, size: 16, font: boldFont, color: rgb(0.12, 0.16, 0.20) });
    y -= 28;
    page.drawText(`Issued reports recorded: ${visibleRecords.length}`, { x: 40, y, size: 10, font: regularFont, color: rgb(0.35, 0.39, 0.45) });
    y -= 24;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: rgb(0.82, 0.86, 0.89) });
    y -= 20;

    const columns = [
      { label: 'Report', x: 40 },
      { label: 'Document number', x: 145 },
      { label: 'Entity / office', x: 265 },
      { label: 'Date', x: 400 },
      { label: 'Status', x: 475 },
    ];
    columns.forEach((column) => page.drawText(column.label, { x: column.x, y, size: 9, font: boldFont, color: rgb(0.25, 0.31, 0.38) }));
    y -= 18;

    visibleRecords.forEach((record) => {
      addPageIfNeeded();
      const values = [
        record.type,
        record.documentNumber || 'Unnumbered',
        record.entityName || '—',
        formatDate(record.reportDate),
        record.status || 'RECORDED',
      ];
      values.forEach((value, index) => page.drawText(String(value).slice(0, index === 2 ? 22 : 18), { x: columns[index].x, y, size: 8.5, font: regularFont, color: rgb(0.20, 0.24, 0.29) }));
      y -= 19;
    });

    const pdfBytes = await pdfDoc.save();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-700"><Icon size={18} /> Reports</div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">Issued reports recorded for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {!isAnnual && (
            <label className="text-sm font-medium text-slate-600">Month<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
              {MONTHS.map((monthName, index) => <option key={monthName} value={index}>{monthName}</option>)}
            </select></label>
          )}
          <label className="text-sm font-medium text-slate-600">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal text-slate-900">
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <div className="flex gap-2">
            <button type="button" title="Download PDF" onClick={() => generatePdf()} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-emerald-700 shadow-sm transition hover:bg-emerald-50"><Download size={18} /></button>
            <button type="button" title="Print report" onClick={() => generatePdf(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-emerald-700 shadow-sm transition hover:bg-emerald-50"><Printer size={18} /></button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="minimal-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileText size={18} className="text-emerald-700" /> Recorded reports</div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{loading ? 'Loading…' : `${visibleRecords.length} report${visibleRecords.length === 1 ? '' : 's'}`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Report</th><th className="px-5 py-3">Document number</th><th className="px-5 py-3">Entity / office</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && visibleRecords.length === 0 && <tr><td colSpan="5" className="px-5 py-10 text-center text-slate-500">No issued reports recorded for this period.</td></tr>}
              {visibleRecords.map((record) => <tr key={`${record.type}-${record.id}`} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-semibold text-slate-800">{record.type}</div><div className="text-xs text-slate-500">{record.title}</div></td><td className="px-5 py-4 font-medium text-slate-700">{record.documentNumber}</td><td className="px-5 py-4 text-slate-600">{record.entityName || '—'}</td><td className="px-5 py-4 text-slate-600">{formatDate(record.reportDate)}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{record.status}</span></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
