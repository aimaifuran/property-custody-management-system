import { useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import { SearchInput, Pagination, PageSizeSelect } from '../components/Pagination';
import { usePaginatedList } from '../hooks/usePaginatedList';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

const FIXED_PURPOSES = ['Disposal', 'Repair', 'Returned To Stock'];

const emptyItem = () => ({
    quantity: '',
    unit: '',
    description: '',
    propertyNumber: '',
    mrNumber: '',
    unitValue: '',
    totalValue: 0
});

const emptySignatory = () => ({ date: '', name: '', designation: '' });

const initial = {
    lguName: '',
    purposeChoice: null,
    purposeOther: '',
    items: [emptyItem()],
    note: '',
    returnedBy: emptySignatory(),
    returnedTo: emptySignatory()
};

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
    purposeChoice: FIXED_PURPOSES.includes(record.purpose) ? record.purpose : 'Other',
    purposeOther: FIXED_PURPOSES.includes(record.purpose) ? '' : (record.purpose || ''),
    items: record.items && record.items.length ? record.items.map((item) => ({
        quantity: item.quantity ?? '',
        unit: item.unit || '',
        description: item.description || '',
        propertyNumber: item.propertyNumber || '',
        mrNumber: item.mrNumber || '',
        unitValue: item.unitValue ?? '',
        totalValue: item.totalValue ?? 0
    })) : [emptyItem()],
    note: record.note || '',
    returnedBy: toFormSignatory(record.returnedBy),
    returnedTo: toFormSignatory(record.returnedTo)
});

export default function PrsPage() {
    const { items: reports, loading, setPage, limit, setLimit, searchInput, setSearchInput, pagination, reload } = usePaginatedList('/prs', { limit: 5 });
    const [form, setForm] = useState(initial);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const formTitleRef = useRef(null);

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => ({
        ...prev,
        [section]: { ...prev[section], [key]: value }
    }));

    const updateItem = (index, key, value) => setForm((prev) => {
        const items = prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item);
        if (key === 'quantity' || key === 'unitValue') {
            items[index].totalValue = Number(items[index].quantity || 0) * Number(items[index].unitValue || 0);
        }
        return { ...prev, items };
    });

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const total = form.items.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);

    const startEdit = (record) => {
        setEditingId(record._id);
        setForm(toForm(record));
        formTitleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(initial);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const save = async (event) => {
        event.preventDefault();
        const purpose = form.purposeChoice === 'Other' ? form.purposeOther : form.purposeChoice;
        const payload = {
            lguName: form.lguName,
            purpose,
            items: form.items.filter((item) => item.propertyNumber || item.description).map((item) => ({
                ...item,
                quantity: Number(item.quantity || 0),
                unitValue: Number(item.unitValue || 0)
            })),
            note: form.note,
            returnedBy: form.returnedBy,
            returnedTo: form.returnedTo
        };
        setSaving(true);
        try {
            if (editingId) {
                await axios.put(`/prs/${editingId}`, payload);
                toast.success('PRS updated');
            } else {
                await axios.post('/prs', payload);
                toast.success('PRS created. Each item logged to Returned Supply.');
            }
            setEditingId(null);
            setForm(initial);
            await reload();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to save PRS');
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

    function formatLegalDateString(dateStr) {
        // Parse the ISO string into a local Date object
        const date = new Date(dateStr);
        
        // Use UTC methods to avoid time zone shifts
        const day = date.getUTCDate();
        const year = date.getUTCFullYear();
        const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
        
        // Determine the ordinal suffix (ST, ND, RD, TH)
        const getOrdinal = (n) => {
            if (n >= 11 && n <= 13) return "TH";
            const lastDigit = n % 10;
            if (lastDigit === 1) return "ST";
            if (lastDigit === 2) return "ND";
            if (lastDigit === 3) return "RD";
            return "TH";
        };
        
        const dayWithSuffix = `${day}${getOrdinal(day)}`;
        return `${dayWithSuffix} DAY OF ${month} ${year}`;
    }

    async function generateExcel(data) {
        console.log('Generating Excel for PRS:', data);

        // Load the template
        const response = await fetch("/forms/templates/prs-template.xlsx");
        const arrayBuffer = await response.arrayBuffer();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // Select the worksheet
        const worksheet = workbook.getWorksheet("PRS");

        // Insert data into specific cells
        worksheet.getCell("H4").value = data.lguName;
        worksheet.getCell("D6").value = data.purpose === "Disposal" ? "( / )":"(   )";
        worksheet.getCell("F6").value = data.purpose === "Repair" ? "( / )":"(   )";
        worksheet.getCell("H6").value = data.purpose === "Returned To Stock" ? "( / )":"(   )";
        worksheet.getCell("L6").value = data.purpose && !["Disposal","Repair","Returned To Stock"].includes(data.purpose) ? "( / )":"(   )";
        worksheet.getCell("O6").value = data.purpose && !["Disposal","Repair","Returned To Stock"].includes(data.purpose) ? data.purpose:"";

        // Table data insertion
        const startRow = 9; // Starting row for table data
        let totalAmount = 0;
        data.items.forEach((item, index) => {
            worksheet.getCell(`A${startRow + index}`).value = item.quantity;
            worksheet.getCell(`C${startRow + index}`).value = item.unit;
            worksheet.getCell(`E${startRow + index}`).value = item.description;
            worksheet.getCell(`M${startRow + index}`).value = item.propertyNumber;
            worksheet.getCell(`O${startRow + index}`).value = item.mrNumber;
            worksheet.getCell(`Q${startRow + index}`).value = data.returnedTo.name;
            worksheet.getCell(`S${startRow + index}`).value = formatAmount(item.unitValue);
            worksheet.getCell(`U${startRow + index}`).value = formatAmount(item.totalValue);
            totalAmount += item.totalValue;
        });

        worksheet.getCell("E35").value = data.note;
        worksheet.getCell("U36").value = formatAmount(totalAmount);

        // Returned to
        worksheet.getCell("A39").value = formatLegalDateString(data.returnedTo.date);
        worksheet.getCell("E42").value = data.returnedTo.name;
        worksheet.getCell("E43").value = data.returnedTo.designation;
        worksheet.getCell("E48").value = data.returnedTo.name;
        worksheet.getCell("E49").value = data.returnedTo.designation;

        // Returned from
        worksheet.getCell("M39").value = formatLegalDateString(data.returnedBy.date);
        worksheet.getCell("N42").value = data.returnedBy.name;
        

        // Generate the modified Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        // Download
        const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        saveAs(blob, "IAR.xlsx");
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
        const existingPdfBytes = await fetch("/forms/templates/prs-template.pdf").then(res =>
            res.arrayBuffer()
        );

        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const form = pdfDoc.getForm();

        form.getTextField("lguName").setText(String(data.lguName ?? ''));
        form.getTextField("disposal").setText(String(data.purpose === "Disposal" ? "/":""));
        form.getTextField("repair").setText(String(data.purpose === "Repair" ? "/":""));
        form.getTextField("returnedToStock").setText(String(data.purpose === "Returned To Stock" ? "/":""));
        form.getTextField("other").setText(String(data.purpose && !["Disposal","Repair","Returned To Stock"].includes(data.purpose) ? "/":""));
        form.getTextField("purpose").setText(String(data.purpose && !["Disposal","Repair","Returned To Stock"].includes(data.purpose) ? data.purpose:""));

        // Table data insertion
        const startRowNumber = 1; // Starting row for table data
        let totalAmount = 0;
        data.items.forEach((item, index) => {
            form.getTextField(`quantity${index + 1}`).setText(String(item.quantity ?? ''));
            form.getTextField(`unit${index + 1}`).setText(String(item.unit ?? ''));
            form.getTextField(`description${index + 1}`).setText(String(item.description ?? ''));
            form.getTextField(`propertyNumber${index + 1}`).setText(String(item.propertyNumber ?? ''));
            form.getTextField(`mrNumber${index + 1}`).setText(String(item.mrNumber ?? ''));
            form.getTextField(`endUser${index + 1}`).setText(String(data.returnedBy ?? ''));
            form.getTextField(`unitValue${index + 1}`).setText(String(formatAmount(item.unitValue ?? '')));
            form.getTextField(`totalValue${index + 1}`).setText(String(formatAmount(item.totalValue ?? '')));
            totalAmount += item.totalValue;
        });
        
        form.getTextField("totalAmount").setText(String(formatAmount(totalAmount ?? '')));
        form.getTextField("note").setText(String(data.note ?? ''));

        // Returned to
        form.getTextField("returnedToDate").setText(String(formatLegalDateString(data.returnedTo.date ?? '')));
        form.getTextField("returnedToName1").setText(String(data.returnedTo.name ?? ''));
        form.getTextField("returnedToDesignation1").setText(String(data.returnedTo.designation ?? ''));
        form.getTextField("returnedToName2").setText(String(data.returnedTo.name ?? ''));
        form.getTextField("returnedToDesignation2").setText(String(data.returnedTo.designation ?? ''));
        
        // Returned by
        form.getTextField("returnedByDate").setText(String(formatLegalDateString(data.returnedBy.date ?? '')));
        form.getTextField("returnedByName").setText(String(data.returnedBy.name ?? ''));

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
            "PRS.pdf"
        );
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Saved Reports</h2>
                    <div className="flex flex-wrap items-center justify-end gap-5 w-[500px]">
                        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search LGU, purpose, note…" />
                        <PageSizeSelect limit={limit} onChange={setLimit} />
                    </div>
                </div>
                {loading ? (
                    <SkeletonList count={3} actions={4} />
                ) : (
                    <>
                        {reports.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Return Slips yet.</p>}
                        {reports.map((item) => (
                            <div key={item._id} className="mt-3 flex items-center justify-between rounded-xl border p-3">
                                <div>
                                    <b>{item.lguName || 'No LGU'}</b>
                                    <div className="text-sm text-slate-500">
                                        {item.purpose || 'N/A'} · {item.items?.length || 0} item(s)
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => startEdit(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                                    <button type="button" onClick={() => generateExcel(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Excel</button>
                                    {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                                    <button type="button" onClick={() => generatePdf(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">PDF</button>
                                    <button type="button" onClick={() => generatePdf(item, true)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print</button>
                                </div>
                            </div>
                        ))}
                    </>
                )}
                {!loading && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />}
            </div>

            <hr className="border-slate-300 border-2" />

            <div className="flex items-center justify-between">
                <div>
                    <h1 ref={formTitleRef} className="text-3xl font-semibold">{editingId ? 'Update Property Return Slip' : 'Property Return Slip'}</h1>
                    <p className="text-sm text-slate-500">Saving a PRS automatically logs each item individually to Returned Supply.</p>
                </div>
                {editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>}
            </div>

            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Name of LGU</span>
                        <input value={form.lguName} onChange={(e) => update('lguName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                </div>

                <div className="mt-6">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Purpose</span>
                    <div className="flex flex-wrap gap-4">
                        {[...FIXED_PURPOSES, 'Other'].map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="purpose"
                                    value={option}
                                    checked={form.purposeChoice === option}
                                    onChange={() => update('purposeChoice', option)}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                    {form.purposeChoice === 'Other' && (
                        <input
                            value={form.purposeOther}
                            onChange={(e) => update('purposeOther', e.target.value)}
                            placeholder="Specify purpose"
                            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 md:w-1/2"
                        />
                    )}
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
                                        <input aria-label="M. R. No." value={item.mrNumber} onChange={(e) => updateItem(index, 'mrNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Unit Value" type="number" value={item.unitValue} onChange={(e) => updateItem(index, 'unitValue', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Total Value" readOnly value={item.totalValue} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2" />
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
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Note</span>
                        <textarea value={form.note} onChange={(e) => update('note', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {signatoryFields('Returned By', 'returnedBy')}
                    {signatoryFields('Returned To', 'returnedTo')}
                </div>

                <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                    {saving ? <Spinner size={16} /> : <RotateCcw size={16} />}
                    {saving ? 'Saving…' : (editingId ? 'Update PRS' : 'Create PRS')}
                </button>
            </motion.form>
        </div>
    );
}
