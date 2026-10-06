import UserAccountSelect from '../components/UserAccountSelect';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Pagination from '../components/Pagination';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toFormSignatory = (signatory = {}) => ({
    user: signatory.user?._id || signatory.user || undefined,
    date: toDateInputValue(signatory.date),
    name: signatory.name || '',
    designation: signatory.designation || ''
});

const toForm = (record) => ({
    ris: record.ris || '',
    risItem: record.risItem || '',
    lguName: record.lguName || '',
    purpose: record.purpose || '',
    quantity: record.quantity ?? '',
    unit: record.unit || '',
    description: record.description || '',
    propertyNumber: record.propertyNumber || '',
    mrNumber: record.mrNumber || '',
    unitValue: record.unitValue ?? '',
    totalValue: record.totalValue ?? 0,
    note: record.note || '',
    returnedBy: record.returnedBy ? toFormSignatory(record.returnedBy) : getStickySignatory('returnedBy', toFormSignatory()),
    returnedTo: getStickySignatory('returnedTo', toFormSignatory(record.returnedTo))
});

export default function ReturnedSupplyPage() {
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [records, setRecords] = useState([]);
    const [issuedRecords, setIssuedRecords] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(records, search);
    const { editorRef, recordsRef, updatedId, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);

    const load = async () => {
      setPageLoading(true);
      setPageLoadError('');
      try {

        const { data } = await axios.get('/returned-supply');
        setRecords(data.data || []);

      } catch (error) {
        setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        setPageLoading(false);
      }
    };

    useEffect(() => { load(); axios.get('/ris').then(({ data }) => setIssuedRecords((data.data || []).filter(record => ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(record.status)))).catch(() => toast.error('Unable to load issued items for return linking')); }, []);
    const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleRecords = filteredReports.slice((page - 1) * perPage, page * perPage);

    const startEdit = (record) => {
        setEditingId(record._id);
        setForm(toForm(record));
    };

    const createNew = () => { setEditingId(null); setForm(toForm({})); };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(null);
    };

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm(prev => {
        const signatory = { ...prev[section], [key]: value, ...(key === 'name' ? { user: undefined } : {}) };
        saveStickySignatory(section, signatory, key);
        return { ...prev, [section]: signatory };
    });

    const updateValue = (key, value) => setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'quantity' || key === 'unitValue') {
            next.totalValue = Number(next.quantity || 0) * Number(next.unitValue || 0);
        }
        return next;
    });

    const save = async (event) => {
        event.preventDefault();
        try {
            await axios[editingId ? 'put' : 'post'](editingId ? `/returned-supply/${editingId}` : '/returned-supply', {
                ...form,
                ris: form.ris || undefined,
                risItem: form.risItem || undefined,
                quantity: Number(form.quantity || 0),
                unitValue: Number(form.unitValue || 0)
            });
            toast.success(editingId ? 'Returned supply record updated' : 'Returned supply record created');
            markUpdated(editingId);
            cancelEdit();
            load();
            scrollToRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save record');
        }
    };

    const signatoryFields = (label, section) => (
        <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">{label}</h3>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Date</span>
                    <input type="date" value={form[section].date} onChange={(e) => updateSignatory(section, 'date', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
                    <input value={form[section].name} onChange={(e) => updateSignatory(section, 'name', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Designation</span>
                    <input value={form[section].designation} onChange={(e) => updateSignatory(section, 'designation', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
            </div>
        </div>
    );

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            <motion.div ref={recordsRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}><NewFormButton onNew={createNew} editorRef={editorRef} /></SavedReportsHeader>
                {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No returned supply records yet.</p>}
                <div className="mt-3 space-y-3">
                    {visibleRecords.map((record) => (
                        <div key={record._id} className={`saved-record rounded-xl border p-4 ${updatedId === record._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="font-semibold">{record.description || 'Untitled item'}</div>
                                    <div className="text-sm text-slate-500">{record.lguName || 'No LGU'} · {record.purpose || 'N/A'}</div>
                                </div>
                                <RecordActionButton action="edit" onClick={() => startEdit(record)} />
                            </div>
                            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                                <div>Quantity: {record.quantity ?? 'N/A'} {record.unit || ''}</div>
                                <div>Property No.: {record.propertyNumber || 'N/A'}</div>
                                <div>M.R. No.: {record.mrNumber || 'N/A'}</div>
                                <div>Unit Value: {Number(record.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                <div>Total Value: {Number(record.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </motion.div>

            {form && (
                <form ref={editorRef} onSubmit={save} className="form-document form-frame scroll-mt-6 p-6">
                    <div className="form-title-row mb-5">
                        <div>
                            <h1 className="form-page-title">Returned Supply</h1>
                            <p className="mt-2 text-sm text-slate-500">Each item on a saved Property Return Slip is logged here individually.</p>
                        </div>
                        <button type="button" onClick={cancelEdit} className="form-title-action rounded-xl border px-3 py-2 text-sm">Cancel</button>
                    </div>
                    <label className="mb-4 block"><span className="mb-1 block font-semibold">Issued item to return</span><select aria-label="Issued item to return" value={form.ris && form.risItem ? `${form.ris}:${form.risItem}` : ''} onChange={event => {
                        const [risId, itemId] = event.target.value.split(':');
                        const record = issuedRecords.find(entry => entry._id === risId);
                        const item = record?.items.find(entry => entry._id === itemId);
                        setForm(prev => ({ ...prev, ris: risId || '', risItem: itemId || '', ...(item ? { description: item.description, unit: item.unit, mrNumber: record.risNumber, returnedBy: { ...prev.returnedBy, user: record.requestedBy?.user || record.receivedBy?.user, name: record.requestedBy?.name || record.receivedBy?.name } } : {}) }));
                    }} className="w-full rounded-lg border px-2 py-2"><option value="">Match typed item and RIS number to the selected account</option>{issuedRecords.filter(record => !form.returnedBy.user || String(record.requestedBy?.user || record.receivedBy?.user) === String(form.returnedBy.user)).flatMap(record => record.items.filter(item => item.quantityIssued > 0).map(item => <option key={`${record._id}:${item._id}`} value={`${record._id}:${item._id}`}>{record.requestedBy?.name || record.receivedBy?.name} ? {record.risNumber} ? {item.description}</option>))}</select></label>
                    <div className="grid gap-3 md:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">Name of LGU</span>
                            <input value={form.lguName} onChange={(e) => update('lguName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">Purpose</span>
                            <input value={form.purpose} onChange={(e) => update('purpose', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                        </label>
                    </div>

                    <TableScroll className="mt-6 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left">
                                    <th className="p-2">Quantity</th>
                                    <th className="p-2">Unit</th>
                                    <th className="p-2">Description</th>
                                    <th className="p-2">Property Number</th>
                                    <th className="p-2">M. R. No.</th>
                                    <th className="p-2">Unit Value</th>
                                    <th className="p-2">Total Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="p-2">
                                        <input aria-label="Quantity" type="number" value={form.quantity} onChange={(e) => updateValue('quantity', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Unit" value={form.unit} onChange={(e) => update('unit', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Description" value={form.description} onChange={(e) => update('description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Property Number" value={form.propertyNumber} onChange={(e) => update('propertyNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="M. R. No." value={form.mrNumber} onChange={(e) => update('mrNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Unit Value" type="number" value={form.unitValue} onChange={(e) => updateValue('unitValue', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Total Value" readOnly value={form.totalValue} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </TableScroll>

                    <div className="mt-4">
                        <label className="block">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">Note</span>
                            <textarea value={form.note} onChange={(e) => update('note', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                        </label>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <div><UserAccountSelect person={form.returnedBy} onChange={person => setForm(prev => ({ ...prev, returnedBy: person, ris: '', risItem: '' }))} />{signatoryFields('Returned By', 'returnedBy')}</div>
                        {signatoryFields('Returned To', 'returnedTo')}
                    </div>

                    <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white">{editingId ? 'Save Changes' : 'Save New Form'}</button>
                </form>
            )}
        </div>
    );
}
