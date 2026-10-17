import { useEffect, useState } from 'react';
import axios from 'axios';
import { iarFormData } from '../utils/iarFormData';

export default function IarSourceSelect({ type, setForm }) {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/iar', { signal: controller.signal }).then(({ data }) => setReports(data.data || []))
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load IAR reports. Reopen this form to retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <div className="my-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
    <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Source IAR</span>
      <select disabled={loading || !!error} value={selected} onChange={event => {
        const report = reports.find(row => row._id === event.target.value);
        if (!report) return;
        setSelected(report._id);
        setForm(previous => ({ ...previous, ...iarFormData(report, type) }));
      }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
        <option value="" disabled>{loading ? 'Loading IAR reports...' : 'Select an IAR to fill this form'}</option>
        {reports.map(report => <option key={report._id} value={report._id}>{report.iarNumber || 'Unnumbered IAR'} - PO {report.poNumber || '-'} - {report.items?.map(item => item.description).filter(Boolean).join(', ')}</option>)}
      </select>
    </label>
    <p className="mt-1 text-xs text-slate-600">{type === 'ris' ? 'Selecting an IAR fills matching header fields. Click Item in the table to choose available stock.' : 'Selecting an IAR fills matching fields and replaces the item rows. Complete the remaining details before saving.'}</p>
    {error && <p role="alert" className="mt-1 text-sm text-rose-700">{error}</p>}
  </div>;
}
