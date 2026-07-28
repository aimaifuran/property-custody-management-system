import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await axios.get('/ics');
            setRecords(data.data || []);
        } finally {
            setLoading(false);
        }
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
        setSaving(true);
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
            await load();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save ICS');
        } finally {
            setSaving(false);
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

    const formatDate = (date) => {
        if (!date) return '';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return escapeHtml(date);
        return `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear()}`;
    };

    const formatAmount = (amount) => {
        return amount.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    };
    
    async function generateExcel(data) {
        console.log('Generating Excel for ICS:', data);

        // Load the template
        const response = await fetch("/forms/templates/ics-template.xlsx");
        const arrayBuffer = await response.arrayBuffer();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // Select the worksheet
        const worksheet = workbook.getWorksheet("ICS");

        // Insert data into specific cells
        worksheet.getCell("C6").value = data.entityName;
        worksheet.getCell("C7").value = data.fundCluster;
        worksheet.getCell("I7").value = data.icsNumber;

        // Table data insertion
        const startRow = 12; // Starting row for table data
        data.items.forEach((item, index) => {
            worksheet.getCell(`A${startRow + index}`).value = item.quantity;
            worksheet.getCell(`B${startRow + index}`).value = item.unit;
            worksheet.getCell(`C${startRow + index}`).value = formatAmount(item.unitCost);
            worksheet.getCell(`D${startRow + index}`).value = formatAmount(item.totalCost);
            worksheet.getCell(`E${startRow + index}`).value = item.description;
            worksheet.getCell(`H${startRow + index}`).value = item.inventoryItemNo;
            worksheet.getCell(`I${startRow + index}`).value = item.estimatedUsefulLife;
        });

        worksheet.getCell("C41").value = formatAmount(data.totalAmount);
        worksheet.getCell("B42").value = data.remarks;

        // Received from
        worksheet.getCell("B47").value = data.receivedFrom.name;
        worksheet.getCell("B49").value = data.receivedFrom.position;
        worksheet.getCell("B51").value = formatDate(data.receivedFrom.date);

        // Received by
        worksheet.getCell("G47").value = data.receivedBy.name;
        worksheet.getCell("G49").value = data.receivedBy.position;
        worksheet.getCell("G51").value = formatDate(data.receivedBy.date);
        

        // Generate the modified Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        // Download
        const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        saveAs(blob, "ICS.xlsx");
    };

    async function generateDoc(data) {
        const response = await fetch("/forms/templates/iar-template.docx");
        const content = await response.arrayBuffer();

        const zip = new PizZip(content);

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        doc.render({
            entityName: data.entityName,
            fundCluster: data.fundCluster,
            supplierName: data.supplierName,
            poNumber: data.poNumber,
            reqOffice: data.requisitioningOffice,
            rcc: data.responsibilityCenterCode,
            iarNumber: data.iarNumber,
            iarDate: formatDate(data.iarDate),
            invoiceNumber: data.invoiceNumber,
            invoiceDate: formatDate(data.invoiceDate),
        });

        const blob = doc.getZip().generate({
            type: "blob",
            mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        saveAs(blob, "IAR.docx");
    };

    async function generatePdf(data, print = false) {
        const existingPdfBytes = await fetch("/forms/templates/ics-template.pdf").then(res =>
            res.arrayBuffer()
        );

        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const form = pdfDoc.getForm();

        form.getTextField("entityName").setText(String(data.entityName));
        form.getTextField("fundCluster").setText(String(data.fundCluster));
        form.getTextField("icsNumber").setText(String(data.icsNumber));

        // Table data insertion
        const startRowNumber = 1; // Starting row for table data
        data.items.forEach((item, index) => {
            form.getTextField(`quantity${index + 1}`).setText(String(item.quantity));
            form.getTextField(`unit${index + 1}`).setText(String(item.unit));
            form.getTextField(`unitCost${index + 1}`).setText(String(formatAmount(item.unitCost)));
            form.getTextField(`totalCost${index + 1}`).setText(String(formatAmount(item.totalCost)));
            form.getTextField(`description${index + 1}`).setText(String(item.description));
            form.getTextField(`inventoryItemNo${index + 1}`).setText(String(item.inventoryItemNo));
            form.getTextField(`estimatedUsefulLife${index + 1}`).setText(String(item.estimatedUsefulLife));
        });
        
        form.getTextField("totalAmount").setText(String(formatAmount(data.totalAmount)));
        form.getTextField("remarks").setText(String(data.remarks));

        // Received from
        form.getTextField("receivedFromName").setText(String(data.receivedFrom?.name || ''));
        form.getTextField("receivedFromPosition").setText(String(data.receivedFrom?.position || ''));
        form.getTextField("receivedFromDate").setText(String(formatDate(data.receivedFrom?.date)));

        // Received by
        form.getTextField("receivedByName").setText(String(data.receivedBy?.name || ''));
        form.getTextField("receivedByPosition").setText(String(data.receivedBy?.position || ''));
        form.getTextField("receivedByDate").setText(String(formatDate(data.receivedBy?.date)));

        // Optional: prevent further editing
        form.flatten();

        const pdfBytes = await pdfDoc.save();

        if (print) {
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, "_blank");
        printWindow.print();
        } else {
        saveAs(
            new Blob([pdfBytes], { type: "application/pdf" }),
            "ICS.pdf"
        );
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold">Inventory Custodian</h1>
                <p className="text-sm text-slate-500">Records here are created automatically from IAR items whose combined total cost is below ₱50,000.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Saved Records</h2>
                {loading ? (
                    <SkeletonList count={3} actions={4} />
                ) : (
                    <>
                        {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No Inventory Custodian records yet.</p>}
                        {records.map((record) => (
                            <div key={record._id} className="mt-3 flex items-center justify-between rounded-xl border p-3">
                                <div>
                                    <b>{record.icsNumber || 'Unassigned ICS No.'}</b>
                                    <div className="text-sm text-slate-500">
                                        {record.entityName || 'No entity'} · Total: {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => startEdit(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                                    <button type="button" onClick={() => generateExcel(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Excel</button>
                                    {/* <button type="button" onClick={() => generateDoc(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                                    <button type="button" onClick={() => generatePdf(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">PDF</button>
                                    <button type="button" onClick={() => generatePdf(record, true)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print</button>
                                </div>
                            </div>
                        ))}
                    </>
                )}
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

                    <button type="submit" disabled={saving} className="mt-5 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                        {saving && <Spinner size={16} />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </form>
            )}
        </div>
    );
}
