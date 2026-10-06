import { embedFormFonts } from '../utils/formPdfFonts';
import { FORM_PDF_FONT_SIZE } from '../utils/historicalFormPdf';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { PDFDocument, rgb } from 'pdf-lib';
import { BarChart3, CalendarDays, Download, FileText, Printer } from 'lucide-react';

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
    const pdfDoc = await PDFDocument.create();
    const { regular: regularFont, bold: boldFont } = await embedFormFonts(pdfDoc);
    const green = rgb(0.10, 0.38, 0.27);
    const lightGreen = rgb(0.91, 0.96, 0.93);
    const ink = rgb(0.12, 0.17, 0.15);

    if (!isAnnual) {
      const page = pdfDoc.addPage([595, 842]);
      const { width, height } = page.getSize();
      const monthlyRecords = visibleRecords;
      const countByType = (types) => monthlyRecords.filter((record) => types.includes(record.type)).length;
      const formRows = forms
        .filter((formOption) => form === 'ALL' || formOption.value === form)
        .map((formOption) => [formOption.label, monthlyRecords.filter((record) => record.type === formOption.value).length]);
      const summaryCards = [
        ['Received', countByType(['IAR'])],
        ['Issued', countByType(['RIS', 'ICS'])],
        ['Returned', countByType(['PRS', 'RETURNED SUPPLY'])],
        ['Transferred', countByType(['PTR'])],
        ['Property records', countByType(['PROPERTY CARD', 'PAR'])],
      ];
      const drawCentered = (text, y, size, font = regularFont, color = ink) => {
        size = FORM_PDF_FONT_SIZE;
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
      };
      const drawCenteredInHeader = (text, y, size, font = regularFont, color = ink) => {
        size = FORM_PDF_FONT_SIZE;
        const headerLeft = 126;
        const headerRight = width - 28;
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: headerLeft + ((headerRight - headerLeft) - textWidth) / 2, y, size, font, color });
      };
      const drawSection = (label, x, y, sectionWidth) => {
        page.drawRectangle({ x, y: y - 2, width: sectionWidth, height: 20, color: green });
        page.drawText(label, { x: x + 8, y: y + 3, size: FORM_PDF_FONT_SIZE, font: boldFont, color: rgb(1, 1, 1) });
      };
      const drawCell = (text, x, y, cellWidth, size = FORM_PDF_FONT_SIZE) => {
        size = FORM_PDF_FONT_SIZE;
        page.drawText(String(text).slice(0, 32), { x: x + 6, y, size, font: regularFont, color: ink });
        page.drawLine({ start: { x, y: y - 5 }, end: { x: x + cellWidth, y: y - 5 }, thickness: 0.4, color: rgb(0.78, 0.84, 0.80) });
      };

      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.99, 0.98) });
      page.drawRectangle({ x: 0, y: height - 7, width, height: 7, color: green });
      page.drawRectangle({ x: 0, y: 0, width, height: 7, color: green });
      try {
        const logoBytes = await fetch('/lgu-logo.png').then((response) => response.arrayBuffer());
        const logo = await pdfDoc.embedPng(logoBytes);
        page.drawImage(logo, { x: 48, y: 754, width: 58, height: 58 });
      } catch {
        // The report remains usable if the logo cannot be loaded.
      }
      drawCenteredInHeader('MUNICIPALITY OF CARIGARA', 788, 18, boldFont, green);
      drawCenteredInHeader('SUPPLY OFFICE', 766, 14, boldFont, green);
      drawCenteredInHeader('Safe and Efficient Supply Management for a Better Service', 749, 8, regularFont, rgb(0.25, 0.31, 0.28));
      page.drawLine({ start: { x: 28, y: 738 }, end: { x: 567, y: 738 }, thickness: 1.4, color: green });
      drawCentered('MONTHLY SUPPLY OFFICE REPORT', 706, 19, boldFont, green);
      drawCentered(`Month: ${MONTHS[month]} ${year}    A.Y.: ${year} - ${year + 1}`, 686, 10, boldFont, ink);

      drawSection('EXECUTIVE SUMMARY', 28, 654, 539);
      const cardWidth = 99;
      summaryCards.forEach(([label, value], index) => {
        const x = 34 + (index * 106);
        page.drawRectangle({ x, y: 575, width: cardWidth, height: 58, color: lightGreen, borderColor: rgb(0.78, 0.86, 0.81), borderWidth: 0.6 });
        page.drawText(String(value), { x: x + (cardWidth - boldFont.widthOfTextAtSize(String(value), FORM_PDF_FONT_SIZE)) / 2, y: 606, size: FORM_PDF_FONT_SIZE, font: boldFont, color: green });
        const labelWidth = regularFont.widthOfTextAtSize(label, FORM_PDF_FONT_SIZE);
        page.drawText(label, { x: x + (cardWidth - labelWidth) / 2, y: 590, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
        const sublabel = label === 'Received' ? '(IAR)' : label === 'Issued' ? '(RIS / ICS)' : label === 'Returned' ? '(PRS)' : label === 'Transferred' ? '(PTR)' : '(PC / PAR)';
        const sublabelWidth = regularFont.widthOfTextAtSize(sublabel, FORM_PDF_FONT_SIZE);
        page.drawText(sublabel, { x: x + (cardWidth - sublabelWidth) / 2, y: 579, size: FORM_PDF_FONT_SIZE, font: regularFont, color: rgb(0.29, 0.38, 0.33) });
      });

      drawSection('SUPPLY TRANSACTIONS', 28, 554, 260);
      page.drawRectangle({ x: 34, y: 394, width: 248, height: 145, color: rgb(1, 1, 1), borderColor: rgb(0.78, 0.84, 0.80), borderWidth: 0.6 });
      page.drawRectangle({ x: 34, y: 516, width: 248, height: 23, color: lightGreen });
      page.drawText('Form', { x: 46, y: 524, size: FORM_PDF_FONT_SIZE, font: boldFont, color: ink });
      page.drawText('Documents', { x: 220, y: 524, size: FORM_PDF_FONT_SIZE, font: boldFont, color: ink });
      formRows.forEach(([formName, count], index) => {
        const y = 502 - (index * 17);
        drawCell(formName, 34, y, 174, 7.5);
        drawCell(count, 208, y, 74, 7.5);
      });

      drawSection('TRANSACTIONS OVERVIEW', 307, 554, 260);
      page.drawRectangle({ x: 313, y: 394, width: 248, height: 145, color: rgb(1, 1, 1), borderColor: rgb(0.78, 0.84, 0.80), borderWidth: 0.6 });
      const chartMax = Math.max(...summaryCards.map(([, value]) => value), 1);
      const chartBottom = 414;
      summaryCards.forEach(([label, value], index) => {
        const barHeight = (value / chartMax) * 86;
        const x = 328 + (index * 45);
        page.drawRectangle({ x, y: chartBottom, width: 24, height: Math.max(barHeight, 2), color: index % 2 ? rgb(0.32, 0.57, 0.43) : rgb(0.56, 0.73, 0.62) });
        page.drawText(String(value), { x: x + 7, y: chartBottom + barHeight + 5, size: FORM_PDF_FONT_SIZE, font: boldFont, color: ink });
        page.drawText(label.slice(0, 8), { x: x - 3, y: 401, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
      });
      page.drawLine({ start: { x: 322, y: chartBottom }, end: { x: 552, y: chartBottom }, thickness: 0.6, color: rgb(0.55, 0.64, 0.58) });

      drawSection('FORM COVERAGE', 28, 373, 260);
      page.drawRectangle({ x: 34, y: 245, width: 248, height: 104, color: rgb(1, 1, 1), borderColor: rgb(0.78, 0.84, 0.80), borderWidth: 0.6 });
      page.drawText('All monthly form records are listed above.', { x: 46, y: 326, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
      page.drawText(`Total form documents: ${monthlyRecords.length}`, { x: 46, y: 309, size: FORM_PDF_FONT_SIZE, font: boldFont, color: green });
      page.drawText('The detailed records remain available in the', { x: 46, y: 287, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
      page.drawText('on-screen report table for document review.', { x: 46, y: 274, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });

      drawSection('NOTABLE ACTIVITIES', 307, 373, 260);
      page.drawRectangle({ x: 313, y: 245, width: 248, height: 104, color: rgb(1, 1, 1), borderColor: rgb(0.78, 0.84, 0.80), borderWidth: 0.6 });
      ['Processed form records for the selected month.', `Recorded ${monthlyRecords.length} document${monthlyRecords.length === 1 ? '' : 's'} across the selected forms.`, 'Updated supply and property accountability records.'].forEach((note, index) => page.drawText(`• ${note}`, { x: 323, y: 326 - (index * 33), size: FORM_PDF_FONT_SIZE, maxWidth: 230, lineHeight: 11, font: regularFont, color: ink }));

      drawSection('REMARKS', 28, 222, 539);
      page.drawRectangle({ x: 34, y: 139, width: 527, height: 66, color: lightGreen, borderColor: rgb(0.78, 0.84, 0.80), borderWidth: 0.6 });
      page.drawText('The Supply Office continues to ensure the proper management of supplies', { x: 46, y: 181, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
      page.drawText('and property records. All forms are organized for review and accountability.', { x: 46, y: 166, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });

      [['Prepared by:', 112], ['Reviewed by:', 285], ['Approved by:', 458]].forEach(([label, x]) => {
        page.drawLine({ start: { x: x - 58, y: 91 }, end: { x: x + 58, y: 91 }, thickness: 0.7, color: rgb(0.38, 0.47, 0.42) });
        page.drawText(label, { x: x - 28, y: 78, size: FORM_PDF_FONT_SIZE, font: regularFont, color: ink });
      });
    } else {
    let page = pdfDoc.addPage([595, 842]);
    let y = 790;

    const addPageIfNeeded = () => {
      if (y < 60) {
        page = pdfDoc.addPage([595, 842]);
        y = 790;
      }
    };

    page.drawText('Property Accountability Management System', { x: 40, y, size: FORM_PDF_FONT_SIZE, font: boldFont, color: rgb(0.18, 0.43, 0.40) });
    y -= 24;
    page.drawText(`${title} - ${periodLabel}`, { x: 40, y, size: FORM_PDF_FONT_SIZE, font: boldFont, color: rgb(0.12, 0.16, 0.20) });
    y -= 28;
    page.drawText(`Issued reports recorded: ${visibleRecords.length}`, { x: 40, y, size: FORM_PDF_FONT_SIZE, font: regularFont, color: rgb(0.35, 0.39, 0.45) });
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
    columns.forEach((column) => page.drawText(column.label, { x: column.x, y, size: FORM_PDF_FONT_SIZE, font: boldFont, color: rgb(0.25, 0.31, 0.38) }));
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
      values.forEach((value, index) => page.drawText(String(value).slice(0, index === 2 ? 22 : 18), { x: columns[index].x, y, size: FORM_PDF_FONT_SIZE, font: regularFont, color: rgb(0.20, 0.24, 0.29) }));
      y -= 19;
    });
    }

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
