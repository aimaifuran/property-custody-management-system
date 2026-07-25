import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

const emptyItem = () => ({
    quantity: '',
    unit: '',
    description: '',
    propertyNumber: '',
    dateAcquired: '',
    amount: ''
});

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toFormItem = (item = {}) => ({
    quantity: item.quantity ?? '',
    unit: item.unit || '',
    description: item.description || '',
    propertyNumber: item.propertyNumber || '',
    dateAcquired: toDateInputValue(item.dateAcquired),
    amount: item.amount ?? ''
});

const toFormSignatory = (signatory = {}) => ({
    name: signatory.name || '',
    position: signatory.position || '',
    date: toDateInputValue(signatory.date)
});

const toForm = (record) => ({
    entityName: record.entityName || '',
    fundCluster: record.fundCluster || '',
    parNumber: record.parNumber || '',
    items: record.items && record.items.length ? record.items.map(toFormItem) : [emptyItem()],
    remarks: record.remarks || '',
    receivedBy: toFormSignatory(record.receivedBy),
    issuedBy: toFormSignatory(record.issuedBy)
});

export default function ParPage() {
    const [records, setRecords] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(null);

    const load = async () => {
        const { data } = await axios.get('/par');
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

    const updateItem = (index, key, value) => setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const total = (form?.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const save = async (event) => {
        event.preventDefault();
        try {
            await axios.put(`/par/${editingId}`, {
                ...form,
                items: form.items.map((item) => ({
                    ...item,
                    quantity: Number(item.quantity || 0),
                    amount: Number(item.amount || 0)
                }))
            });
            toast.success('Property Acknowledgement Receipt updated');
            cancelEdit();
            load();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save PAR');
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
        console.log('Generating Excel for PAR:', data);

        // Load the template
        const response = await fetch("/forms/templates/par-template.xlsx");
        const arrayBuffer = await response.arrayBuffer();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // Select the worksheet
        const worksheet = workbook.getWorksheet("PAR");

        // Insert data into specific cells
        worksheet.getCell("C6").value = data.entityName;
        worksheet.getCell("C7").value = data.fundCluster;
        worksheet.getCell("I7").value = data.parNumber;

        // Table data insertion
        const startRow = 11; // Starting row for table data
        data.items.forEach((item, index) => {
            worksheet.getCell(`A${startRow + index}`).value = item.quantity;
            worksheet.getCell(`B${startRow + index}`).value = item.unit;
            worksheet.getCell(`D${startRow + index}`).value = item.description;
            worksheet.getCell(`F${startRow + index}`).value = item.propertyNumber;
            worksheet.getCell(`H${startRow + index}`).value = formatDate(item.dateAcquired);
            worksheet.getCell(`I${startRow + index}`).value = formatAmount(item.amount);
        });

        worksheet.getCell("I40").value = formatAmount(data.totalAmount);
        worksheet.getCell("B41").value = data.remarks;

        // Received by
        worksheet.getCell("B45").value = data.receivedBy.name;
        worksheet.getCell("B47").value = data.receivedBy.position;
        worksheet.getCell("B49").value = formatDate(data.receivedBy.date);

        // Issued by
        worksheet.getCell("G45").value = data.issuedBy.name;
        worksheet.getCell("G47").value = data.issuedBy.position;
        worksheet.getCell("G49").value = formatDate(data.issuedBy.date);
        

        // Generate the modified Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        // Download
        const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        saveAs(blob, "PAR.xlsx");
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
        const existingPdfBytes = await fetch("/forms/templates/iar-template.pdf").then(res =>
            res.arrayBuffer()
        );

        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const form = pdfDoc.getForm();

        form.getTextField("entityName").setText(data.entityName);
        form.getTextField("fundCluster").setText(data.fundCluster);
        form.getTextField("supplierName").setText(data.supplierName);
        form.getTextField("poNumber").setText(data.poNumber);
        form.getTextField("reqOffice").setText(data.requisitioningOffice);
        form.getTextField("rcc").setText(data.responsibilityCenterCode);
        form.getTextField("iarNumber").setText(data.iarNumber);
        form.getTextField("iarDate").setText(formatDate(data.iarDate));
        form.getTextField("invoiceNumber").setText(data.invoiceNumber);
        form.getTextField("invoiceDate").setText(formatDate(data.invoiceDate));

        // Table data insertion
        const startRowNumber = 1; // Starting row for table data
        data.items.forEach((item, index) => {
        form.getTextField(`stockNumber${index + 1}`).setText(item.stockNumber);
        form.getTextField(`description${index + 1}`).setText(item.description);
        form.getTextField(`unit${index + 1}`).setText(item.unit);
        form.getTextField(`quantity${index + 1}`).setText(String(item.quantity));
        });

        
        form.getTextField("inspectionDate").setText(formatDate(data.inspectionDate));
        form.getTextField("inspectedBy").setText(data.inspectedBy);
        form.getTextField("acceptanceDate").setText(formatDate(data.acceptanceDate));
        form.getTextField("complete").setText(data.acceptanceStatus === "Complete" ? "/" : "");
        form.getTextField("partial").setText(data.acceptanceStatus === "Partial" ? "/" : "");
        form.getTextField("acceptedBy").setText(data.acceptedBy);

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
            "IAR.pdf"
        );
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold">Property Acknowledgement Receipts</h1>
                <p className="text-sm text-slate-500">Records here are created automatically from IAR items whose combined total cost is ₱50,000 or more.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Saved Records</h2>
                {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Acknowledgement Receipt records yet.</p>}
                {records.map((record) => (
                    <div key={record._id} className="mt-3 flex items-center justify-between rounded-xl border p-3">
                        <div>
                            <b>{record.parNumber || 'Unassigned PAR No.'}</b>
                            <div className="text-sm text-slate-500">
                                {record.entityName || 'No entity'} · Total: {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => startEdit(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                            <button type="button" onClick={() => generateExcel(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Excel</button>
                            <button type="button" onClick={() => generateDoc(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button>
                            <button type="button" onClick={() => generatePdf(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">PDF</button>
                            <button type="button" onClick={() => generatePdf(record, true)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print</button>
                        </div>
                    </div>
                ))}
            </div>

            {form && (
                <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-xl font-semibold">Edit Property Acknowledgement Receipt</h2>
                        <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        {field('Entity Name', 'entityName')}
                        {field('Fund Cluster', 'fundCluster')}
                        {field('PAR No.', 'parNumber')}
                    </div>
                    <div className="mt-6 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-left">
                                    <th className="p-2">Quantity</th>
                                    <th className="p-2">Unit</th>
                                    <th className="p-2">Description</th>
                                    <th className="p-2">Property Number</th>
                                    <th className="p-2">Date Acquired</th>
                                    <th className="p-2">Amount</th>
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
                                            <input aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Property Number" value={item.propertyNumber} onChange={(e) => updateItem(index, 'propertyNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Date Acquired" type="date" value={item.dateAcquired} onChange={(e) => updateItem(index, 'dateAcquired', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input aria-label="Amount" type="number" value={item.amount} onChange={(e) => updateItem(index, 'amount', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
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
                        {signatoryFields('Received By', 'receivedBy')}
                        {signatoryFields('Issued By', 'issuedBy')}
                    </div>

                    <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white">Save Changes</button>
                </form>
            )}
        </div>
    );
}
