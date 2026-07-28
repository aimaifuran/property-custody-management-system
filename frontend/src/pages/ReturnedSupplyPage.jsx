import { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import { SearchInput, Pagination, PageSizeSelect } from '../components/Pagination';
import { usePaginatedList } from '../hooks/usePaginatedList';

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toFormSignatory = (signatory = {}) => ({
    date: toDateInputValue(signatory.date),
    name: signatory.name || '',
    designation: signatory.designation || ''
});

const toForm = (record) => ({
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
    returnedBy: toFormSignatory(record.returnedBy),
    returnedTo: toFormSignatory(record.returnedTo)
});

export default function ReturnedSupplyPage() {
    const { items: records, loading, setPage, limit, setLimit, searchInput, setSearchInput, pagination, reload } = usePaginatedList('/returned-supply', { limit: 5 });
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);

    const startEdit = (record) => {
        setEditingId(record._id);
        setForm(toForm(record));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(null);
    };

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => ({
        ...prev,
        [section]: { ...prev[section], [key]: value }
    }));

    const updateValue = (key, value) => setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'quantity' || key === 'unitValue') {
            next.totalValue = Number(next.quantity || 0) * Number(next.unitValue || 0);
        }
        return next;
    });

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await axios.put(`/returned-supply/${editingId}`, {
                ...form,
                quantity: Number(form.quantity || 0),
                unitValue: Number(form.unitValue || 0)
            });
            toast.success('Returned supply record updated');
            cancelEdit();
            await reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save record');
        } finally {
            setSaving(false);
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold">Returned Supply</h1>
                <p className="text-sm text-slate-500">Each item on a saved Property Return Slip is logged here individually.</p>
            </div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Returned Items</h2>
                    <div className="flex flex-wrap items-center justify-end gap-5 w-[500px]">
                        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search LGU, purpose, description, property/M.R. no.…" />
                        <PageSizeSelect limit={limit} onChange={setLimit} />
                    </div>
                </div>
                {loading ? (
                    <SkeletonList count={3} actions={1} />
                ) : (
                    <>
                        {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No returned supply records yet.</p>}
                        <div className="mt-3 space-y-3">
                            {records.map((record) => (
                                <div key={record._id} className="rounded-xl border border-slate-200 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold">{record.description || 'Untitled item'}</div>
                                            <div className="text-sm text-slate-500">{record.lguName || 'No LGU'} · {record.purpose || 'N/A'}</div>
                                        </div>
                                        <button type="button" onClick={() => startEdit(record)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
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
                    </>
                )}
                {!loading && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />}
            </motion.div>

            {form && (
                <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Edit Returned Supply Record</h2>
                        <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>
                    </div>
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

                    <div className="mt-6 overflow-x-auto">
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
                    </div>

                    <div className="mt-4">
                        <label className="block">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">Note</span>
                            <textarea value={form.note} onChange={(e) => update('note', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                        </label>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {signatoryFields('Returned By', 'returnedBy')}
                        {signatoryFields('Returned To', 'returnedTo')}
                    </div>

                    <button type="submit" disabled={saving} className="mt-5 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                        {saving && <Spinner size={16} />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </form>
            )}
        </div>
    );
}
