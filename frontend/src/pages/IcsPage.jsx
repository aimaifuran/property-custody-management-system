import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const emptyItem = () => ({
    quantity: '',
    unit: '',
    unitCost: '',
    totalCost: 0,
    description: '',
    inventoryItemNo: '',
    estimatedUsefulLife: ''
});

const toFormItem = (item = {}) => ({
    quantity: item.quantity ?? '',
    unit: item.unit || '',
    unitCost: item.unitCost ?? '',
    totalCost: item.totalCost ?? 0,
    description: item.description || '',
    inventoryItemNo: item.inventoryItemNo || '',
    estimatedUsefulLife: item.estimatedUsefulLife || ''
});

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toFormSignatory = (signatory = {}) => ({
    name: signatory.name || '',
    position: signatory.position || '',
    date: toDateInputValue(signatory.date)
});

const toForm = (record) => ({
    entityName: record.entityName || '',
    fundCluster: record.fundCluster || '',
    icsNumber: record.icsNumber || '',
    items: record.items && record.items.length ? record.items.map(toFormItem) : [emptyItem()],
    remarks: record.remarks || '',
    receivedFrom: toFormSignatory(record.receivedFrom),
    receivedBy: toFormSignatory(record.receivedBy)
});

export default function IcsPage() {
    const [records, setRecords] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(null);

    const load = async () => {
        const { data } = await axios.get('/ics');
        setRecords(data.data || []);
    };

    useEffect(() => { load(); }, []);

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

    const updateItem = (index, key, value) => setForm((prev) => {
        const items = prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item);
        if (key === 'quantity' || key === 'unitCost') {
            items[index].totalCost = Number(items[index].quantity || 0) * Number(items[index].unitCost || 0);
        }
        return { ...prev, items };
    });

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const total = (form?.items || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);

    const save = async (event) => {
        event.preventDefault();
        try {
            await axios.put(`/ics/${editingId}`, {
                ...form,
                items: form.items.map((item) => ({
                    ...item,
                    quantity: Number(item.quantity || 0),
                    unitCost: Number(item.unitCost || 0)
                }))
            });
            toast.success('Inventory Custodian Slip updated');
            cancelEdit();
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save ICS');
        }
    };

    const field = (label, key, type = 'text') => (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input type={type} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    );

    const signatoryFields = (label, section) => (
        <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">{label}</h3>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
                    <input value={form[section].name} onChange={(e) => updateSignatory(section, 'name', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Position</span>
                    <input value={form[section].position} onChange={(e) => updateSignatory(section, 'position', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Date</span>
                    <input type="date" value={form[section].date} onChange={(e) => updateSignatory(section, 'date', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold">Inventory Custodian</h1>
                <p className="text-sm text-slate-500">Records here are created automatically from IAR items whose combined total cost is below ₱50,000.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Saved Records</h2>
                {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No Inventory Custodian records yet.</p>}
                {records.map((record) => (
                    <div key={record._id} className="mt-3 flex items-center justify-between rounded-xl border p-3">
                        <div>
                            <b>{record.icsNumber || 'Unassigned ICS No.'}</b>
                            <div className="text-sm text-slate-500">
                                {record.entityName || 'No entity'} · Total: {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <button type="button" onClick={() => startEdit(record)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                    </div>
                ))}
            </div>

            {form && (
                <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Edit Inventory Custodian Slip</h2>
                        <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        {field('Entity Name', 'entityName')}
                        {field('Fund Cluster', 'fundCluster')}
                        {field('ICS No.', 'icsNumber')}
                    </div>
                    <div className="mt-6 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left">
                                    <th className="p-2">Quantity</th>
                                    <th className="p-2">Unit</th>
                                    <th className="p-2">Unit Cost</th>
                                    <th className="p-2">Total Cost</th>
                                    <th className="p-2">Description</th>
                                    <th className="p-2">Inventory Item No.</th>
                                    <th className="p-2">Estimated Useful Life</th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="p-2">
                                            <input aria-label="Quantity" type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Unit" value={item.unit} onChange={(e) => updateItem(index, 'unit', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Unit Cost" type="number" value={item.unitCost} onChange={(e) => updateItem(index, 'unitCost', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Total Cost" readOnly value={item.totalCost} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Inventory Item No." value={item.inventoryItemNo} onChange={(e) => updateItem(index, 'inventoryItemNo', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Estimated Useful Life" value={item.estimatedUsefulLife} onChange={(e) => updateItem(index, 'estimatedUsefulLife', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" onClick={addItem} className="mt-3 rounded-xl border px-3 py-2">Add item</button>

                    <div className="mt-4 flex justify-end">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold">
                            Total: {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="block">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">Remarks</span>
                            <textarea value={form.remarks} onChange={(e) => update('remarks', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                        </label>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {signatoryFields('Received From', 'receivedFrom')}
                        {signatoryFields('Received By', 'receivedBy')}
                    </div>

                    <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white">Save Changes</button>
                </form>
            )}
        </div>
    );
}
