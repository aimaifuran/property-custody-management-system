import { useEffect, useState } from 'react';
import axios from 'axios';
import { iarFormData } from '../utils/iarFormData';
import { getIssuedSourceRows } from '../utils/ptrIssuedItems';
import SearchInput from './SearchInput';

export default function IarSourceSelect({ type, setForm, onSourceSelect, onSourceClear, accountabilities = [] }) {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/iar', { signal: controller.signal }).then(({ data }) => setReports(data.data || []))
      .catch(() => { if (!controller.signal.aborted) setError('Unable to load property records. Reopen this form to retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type]);
  const selectableReports = type === 'ptr'
    ? reports.map(report => ({
      ...report,
      items: getIssuedSourceRows(
        (report.items || []).filter(item => (item.acceptedQuantity ?? item.quantity) > 0),
        accountabilities,
      ),
    })).filter(report => report.items.length > 0)
    : reports;
  const options = selectableReports.map(report => ({
    value: report._id,
    label: type === 'ptr'
      ? `PO ${report.poNumber || '-'} - ${report.items?.map(item => item.propertyPlantAndEquipment || item.item || item.inventory?.item?.name).filter(Boolean).join(', ') || 'Unnamed item'}`
      : `${report.iarNumber || 'Unnumbered IAR'} - PO ${report.poNumber || '-'} - ${report.items?.map(item => item.description).filter(Boolean).join(', ')}`,
    keywords: `${report.iarNumber || ''} ${report.poNumber || ''} ${report.items?.flatMap(item => [item.propertyPlantAndEquipment, item.item, item.description, item.inventory?.item?.name]).filter(Boolean).join(' ') || ''}`,
  }));
  return <div className="my-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
    <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Source Property Record</span>
      {type === 'ptr' ? <SearchInput
          disabled={loading || !!error}
          aria-label="Source Property Record"
          placeholder={loading ? 'Loading property records...' : 'Search a property record'}
          value={search}
          options={options}
          onChange={value => {
            setSearch(value);
            if (selected) onSourceClear?.();
            setSelected('');
            if (selected) setForm(previous => ({ ...previous, iar: undefined }));
          }}
          onSelect={option => {
            const report = selectableReports.find(row => row._id === option.value);
            if (!report) return;
            setSelected(report._id);
            const formData = iarFormData(report, type);
            if (onSourceSelect) onSourceSelect(report, formData);
            else setForm(previous => ({ ...previous, ...formData }));
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
        /> : <select disabled={loading || !!error} value={selected} onChange={event => {
          const report = reports.find(row => row._id === event.target.value);
          if (!report) return;
          setSelected(report._id);
          setForm(previous => ({ ...previous, ...iarFormData(report, type) }));
        }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
          <option value="" disabled>{loading ? 'Loading property records...' : 'Select a property record to fill this form'}</option>
          {selectableReports.map(report => <option key={report._id} value={report._id}>{options.find(option => option.value === report._id)?.label}</option>)}
        </select>}
    </label>
    <p className="mt-1 text-xs text-slate-600">{type === 'ris' ? 'Selecting a property record fills matching header fields. Click Item in the table to choose available stock.' : 'Selecting a property record fills matching fields and replaces the item rows. Complete the remaining details before saving.'}</p>
    {error && <p role="alert" className="mt-1 text-sm text-rose-700">{error}</p>}
  </div>;
}
