import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { buildAnnualOfficePdf } from '../utils/annualOfficePdf';

export default function AnnualOfficeItemsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('all');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [exporting, setExporting] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get('/reports/annual-office-items', { params: { year, period }, signal: controller.signal })
      .then(({ data }) => { setGroups(data.data.groups); setSelectedType(previous => data.data.groups.some(group => group.itemType === previous) ? previous : data.data.groups[0]?.itemType || ''); })
      .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Unable to load annual office items.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, period, refresh]);
  const exportGroup = async (group, print = false) => {
    const printWindow = print ? window.open('', '_blank') : null;
    if (print && !printWindow) return toast.error('Allow pop-ups to print this document.');
    setExporting(group.itemType);
    try {
      const blob = new Blob([await buildAnnualOfficePdf(group, year)], { type: 'application/pdf' });
      if (print) {
        const url = URL.createObjectURL(blob); printWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else saveAs(blob, `Annual-${year}-${group.itemType.replace(/[^a-z0-9]+/gi, '-')}.pdf`);
    } catch { printWindow?.close(); toast.error('Unable to prepare the annual item document.'); }
    finally { setExporting(''); }
  };
  const selected = groups.find(group => group.itemType === selectedType);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-semibold">Annual Reports</h1><p className="text-slate-500">One document per item type, listing its recorded quantities, offices, and custodians.</p></div>
      <div className="flex flex-wrap items-end gap-2"><label>Year<input type="number" min="2000" max="2100" value={year} onChange={event => setYear(event.target.value)} className="mt-1 block w-24 rounded-lg border px-2 py-1" /></label><label>Items<select value={period} onChange={event => setPeriod(event.target.value)} className="mt-1 block rounded-lg border px-2 py-1"><option value="all">Recorded through this year</option><option value="acquired">Recorded in this year only</option></select></label><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-lg border">Refresh</button></div>
    </div>
    <p className="text-slate-500">Issued records and confirmed returns are included. Older records without dated movement history use their recorded office assignment.</p>
    {loading ? <PageSkeleton /> : error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p> : groups.length === 0 ? <p className="minimal-surface p-4">No office items recorded for this year.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groups.map(group => <section key={group.itemType} className="minimal-surface p-3"><h2 className="font-semibold capitalize">{group.itemType}</h2><p>{group.quantity} items · {group.offices.length} offices</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedType(group.itemType)} aria-pressed={selectedType === group.itemType} className="rounded-lg bg-emerald-700 text-white">View document</button><RecordActionButton action="pdf" busy={exporting === group.itemType} disabled={!!exporting} onClick={() => exportGroup(group)} /><RecordActionButton action="print" busy={exporting === group.itemType} disabled={!!exporting} onClick={() => exportGroup(group, true)} /></div></section>)}</div>
      {selected && <section className="minimal-surface p-4"><h2 className="font-semibold capitalize">{selected.itemType} — {year}</h2><p className="mb-3">Total quantity: {selected.quantity}</p><TableScroll label={`${selected.itemType} office item document`}><table className="w-full text-left"><thead><tr>{['Office', 'Item', 'Quantity', 'Unit', 'Property / Stock No.', 'Custodian', 'Document'].map(label => <th key={label} className="border-b p-2">{label}</th>)}</tr></thead><tbody>{selected.rows.map(row => <tr key={row.id}><td className="border-b p-2">{row.office}</td><td className="border-b p-2">{row.description}</td><td className="border-b p-2">{row.quantity}</td><td className="border-b p-2">{row.unit || '—'}</td><td className="border-b p-2">{row.propertyNumber || row.stockNumber || '—'}</td><td className="border-b p-2">{row.custodian || '—'}</td><td className="border-b p-2">{row.documentNumber}</td></tr>)}</tbody></table></TableScroll></section>}
    </>}
  </div>;
}
