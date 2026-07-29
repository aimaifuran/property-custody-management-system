import { useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import { SearchInput, Pagination, PageSizeSelect } from '../components/Pagination';
import DownloadButton from '../components/DownloadButton';
import { usePaginatedList } from '../hooks/usePaginatedList';
import { useDownloadStatus } from '../hooks/useDownloadStatus';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

const FIXED_TRANSFER_TYPES = ['Donation', 'Reassignment', 'Relocation'];

const emptyItem = () => ({
    dateAcquired: '',
    propertyNumber: '',
    description: '',
    amount: '',
    condition: ''
});

const emptySignatory = () => ({ name: '', designation: '', date: '' });

const initial = {
    entityName: '',
    fundCluster: '',
    fromAccountableOfficer: '',
    toAccountableOfficer: '',
    ptrNumber: '',
    date: '',
    transferTypeChoice: null,
    transferTypeOther: '',
    items: [emptyItem()],
    remarks: '',
    reasonForTransfer: '',
    approvedBy: emptySignatory(),
    issuedBy: emptySignatory(),
    receivedBy: emptySignatory()
};

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toFormSignatory = (signatory = {}) => ({
    name: signatory.name || '',
    designation: signatory.designation || '',
    date: toDateInputValue(signatory.date)
});

const toForm = (record) => ({
    entityName: record.entityName || '',
    fundCluster: record.fundCluster || '',
    fromAccountableOfficer: record.fromAccountableOfficer || '',
    toAccountableOfficer: record.toAccountableOfficer || '',
    ptrNumber: record.ptrNumber || '',
    date: toDateInputValue(record.date),
    transferTypeChoice: FIXED_TRANSFER_TYPES.includes(record.transferType) ? record.transferType : 'Other',
    transferTypeOther: FIXED_TRANSFER_TYPES.includes(record.transferType) ? '' : (record.transferType || ''),
    items: record.items && record.items.length ? record.items.map((item) => ({
        dateAcquired: toDateInputValue(item.dateAcquired),
        propertyNumber: item.propertyNumber || '',
        description: item.description || '',
        amount: item.amount ?? '',
        condition: item.condition || ''
    })) : [emptyItem()],
    remarks: record.remarks || '',
    reasonForTransfer: record.reasonForTransfer || '',
    approvedBy: toFormSignatory(record.approvedBy),
    issuedBy: toFormSignatory(record.issuedBy),
    receivedBy: toFormSignatory(record.receivedBy)
});

export default function PtrPage() {
    const { items: reports, loading, setPage, limit, setLimit, searchInput, setSearchInput, pagination, reload } = usePaginatedList('/ptr', { limit: 5 });
    const [form, setForm] = useState(initial);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const formTitleRef = useRef(null);
    const { getStatus, run } = useDownloadStatus();

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
        const transferType = form.transferTypeChoice === 'Other' ? form.transferTypeOther : form.transferTypeChoice;
        const payload = {
            entityName: form.entityName,
            fundCluster: form.fundCluster,
            fromAccountableOfficer: form.fromAccountableOfficer,
            toAccountableOfficer: form.toAccountableOfficer,
            ptrNumber: form.ptrNumber,
            date: form.date,
            transferType,
            items: form.items.filter((item) => item.propertyNumber || item.description).map((item) => ({
                ...item,
                amount: Number(item.amount || 0)
            })),
            remarks: form.remarks,
            reasonForTransfer: form.reasonForTransfer,
            approvedBy: form.approvedBy,
            issuedBy: form.issuedBy,
            receivedBy: form.receivedBy
        };
        setSaving(true);
        try {
            if (editingId) {
                await axios.put(`/ptr/${editingId}`, payload);
                toast.success('PTR updated');
            } else {
                await axios.post('/ptr', payload);
                toast.success('PTR created');
            }
            setEditingId(null);
            setForm(initial);
            await reload();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to save PTR');
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
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Designation</span>
                    <input value={form[section].designation} onChange={(e) => updateSignatory(section, 'designation', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
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
        console.log('Generating Excel for PTR:', data);

        // Load the template
        const response = await fetch("/forms/templates/ptr-template.xlsx");
        const arrayBuffer = await response.arrayBuffer();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        // Select the worksheet
        const worksheet = workbook.getWorksheet("PTR");

        // Insert data into specific cells
        worksheet.getCell("B6").value = data.entityName;
        worksheet.getCell("J6").value = data.fundCluster;
        worksheet.getCell("F8").value = data.fromAccountableOfficer;
        worksheet.getCell("F9").value = data.toAccountableOfficer;
        worksheet.getCell("J8").value = data.ptrNumber;
        worksheet.getCell("J9").value = formatDate(data.date);
        worksheet.getCell("B13").value = data.transferType === "Donation" ? "/":"";
        worksheet.getCell("B14").value = data.transferType === "Reassignment" ? "/":"";
        worksheet.getCell("E13").value = data.transferType === "Relocate" ? "/":"";
        worksheet.getCell("E14").value = data.transferType && !["Donation","Reassignment","Relocate"].includes(data.transferType) ? "/":"";
        worksheet.getCell("G14").value = data.transferType && !["Donation","Reassignment","Relocate"].includes(data.transferType) ? data.transferType:"";

        // Table data insertion
        const startRow = 18; // Starting row for table data
        data.items.forEach((item, index) => {
            worksheet.getCell(`A${startRow + index}`).value = item.dateAcquired;
            worksheet.getCell(`B${startRow + index}`).value = item.propertyNumber;
            worksheet.getCell(`D${startRow + index}`).value = item.description;
            worksheet.getCell(`I${startRow + index}`).value = formatAmount(item.amount);
            worksheet.getCell(`J${startRow + index}`).value = item.condition;
        });
        
        worksheet.getCell("B43").value = data.remarks;
        worksheet.getCell("C44").value = data.reasonForTransfer;

        // Approved by
        worksheet.getCell("B50").value = data.approvedBy.name;
        worksheet.getCell("B51").value = data.approvedBy.designation;
        worksheet.getCell("B52").value = formatDate(data.approvedBy.date);

        // Issued by
        worksheet.getCell("F50").value = data.issuedBy.name;
        worksheet.getCell("F51").value = data.issuedBy.designation;
        worksheet.getCell("F52").value = formatDate(data.issuedBy.date);

        // Received by
        worksheet.getCell("I50").value = data.receivedBy.name;
        worksheet.getCell("I51").value = data.receivedBy.designation;
        worksheet.getCell("I52").value = formatDate(data.receivedBy.date);
        

        // Generate the modified Excel file
        const buffer = await workbook.xlsx.writeBuffer();

        // Download
        const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        saveAs(blob, "PTR.xlsx");
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
        const existingPdfBytes = await fetch("/forms/templates/ptr-template.pdf").then(res =>
            res.arrayBuffer()
        );

        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const form = pdfDoc.getForm();

        form.getTextField("entityName").setText(String(data.entityName ?? ''));
        form.getTextField("fundCluster").setText(String(data.fundCluster ?? ''));
        form.getTextField("fromAccountableOfficer").setText(String(data.fromAccountableOfficer ?? ''));
        form.getTextField("toAccountableOfficer").setText(String(data.toAccountableOfficer ?? ''));
        form.getTextField("ptrNumber").setText(String(data.ptrNumber ?? ''));
        form.getTextField("date").setText(String(formatDate(data.date ?? '')));
        form.getTextField("donation").setText(String(data.transferType === "Donation" ? "/" : ""));
        form.getTextField("reassignment").setText(String(data.transferType === "Reassignment" ? "/" : ""));
        form.getTextField("relocate").setText(String(data.transferType === "Relocate" ? "/" : ""));
        form.getTextField("other").setText(String(data.transferType && !["Donation", "Reassignment", "Relocate"].includes(data.transferType) ? "/" : ""));
        form.getTextField("transferType").setText(String(data.transferType && !["Donation", "Reassignment", "Relocate"].includes(data.transferType) ? data.transferType : ""));

        // Table data insertion
        const startRowNumber = 1; // Starting row for table data
        data.items.forEach((item, index) => {
            form.getTextField(`dateAcquired${index + 1}`).setText(String(formatDate(item.dateAcquired ?? '')));
            form.getTextField(`propertyNumber${index + 1}`).setText(String(item.propertyNumber ?? ''));
            form.getTextField(`description${index + 1}`).setText(String(item.description ?? ''));
            form.getTextField(`amount${index + 1}`).setText(String(formatAmount(item.amount ?? '')));
            form.getTextField(`condition${index + 1}`).setText(String(item.condition ?? ''));
        });

        form.getTextField("remarks").setText(String(data.remarks ?? ''));
        form.getTextField("reasonForTransfer").setText(String(data.reasonForTransfer ?? ''));

        // Approved by
        form.getTextField("approvedByName").setText(String(data.approvedBy?.name || ''));
        form.getTextField("approvedByDesignation").setText(String(data.approvedBy?.designation || ''));
        form.getTextField("approvedByDate").setText(String(formatDate(data.approvedBy?.date ?? '')));

        // Issued by
        form.getTextField("issuedByName").setText(String(data.issuedBy?.name || ''));
        form.getTextField("issuedByDesignation").setText(String(data.issuedBy?.designation || ''));
        form.getTextField("issuedByDate").setText(String(formatDate(data.issuedBy?.date ?? '')));

        // Received by
        form.getTextField("receivedByName").setText(String(data.receivedBy?.name || ''));
        form.getTextField("receivedByDesignation").setText(String(data.receivedBy?.designation || ''));
        form.getTextField("receivedByDate").setText(String(formatDate(data.receivedBy?.date ?? '')));

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
            "PTR.pdf"
        );
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold">Saved Reports</h2>
                    <div className="flex flex-wrap items-center justify-end gap-5 w-[500px]">
                        <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search entity, officer, PTR no., transfer type…" />
                        <PageSizeSelect limit={limit} onChange={setLimit} />
                    </div>
                </div>
                {loading ? (
                    <SkeletonList count={3} actions={4} />
                ) : (
                    <>
                        {reports.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Transfer Reports yet.</p>}
                        {reports.map((item) => (
                            <div key={item._id} className="mt-3 flex items-center justify-between rounded-xl border p-3">
                                <div>
                                    <b>{item.ptrNumber}</b>
                                    <div className="text-sm text-slate-500">
                                        {item.fromAccountableOfficer || 'N/A'} {'->'} {item.toAccountableOfficer || 'N/A'} · {item.transferType || 'N/A'}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <DownloadButton type="update" onClick={() => startEdit(item)} />
                                    <DownloadButton type="excel" status={getStatus(`${item._id}-excel`)} onClick={() => run(`${item._id}-excel`, () => generateExcel(item))} />
                                    {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                                    <DownloadButton type="pdf" status={getStatus(`${item._id}-pdf`)} onClick={() => run(`${item._id}-pdf`, () => generatePdf(item))} />
                                    <DownloadButton type="print" status={getStatus(`${item._id}-print`)} onClick={() => run(`${item._id}-print`, () => generatePdf(item, true))} />
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
                    <h1 ref={formTitleRef} className="text-3xl font-semibold">{editingId ? 'Update Property Transfer Report' : 'Property Transfer Report'}</h1>
                    <p className="text-sm text-slate-500">Transfer an accountable asset to another custodian.</p>
                </div>
                {editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>}
            </div>

            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                    {field('Entity Name', 'entityName')}
                    {field('Fund Cluster', 'fundCluster')}
                    {field('PTR No.', 'ptrNumber')}
                    {field('From Accountable Officer', 'fromAccountableOfficer')}
                    {field('To Accountable Officer', 'toAccountableOfficer')}
                    {field('Date', 'date', 'date')}
                </div>

                <div className="mt-6">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Transfer Type</span>
                    <div className="flex flex-wrap gap-4">
                        {[...FIXED_TRANSFER_TYPES, 'Other'].map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm">
                                <input
                                    type="radio"
                                    name="transferType"
                                    value={option}
                                    checked={form.transferTypeChoice === option}
                                    onChange={() => update('transferTypeChoice', option)}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                    {form.transferTypeChoice === 'Other' && (
                        <input
                            value={form.transferTypeOther}
                            onChange={(e) => update('transferTypeOther', e.target.value)}
                            placeholder="Specify transfer type"
                            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 md:w-1/2"
                        />
                    )}
                </div>

                <div className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="p-2">Date Acquired</th>
                                <th className="p-2">Property No.</th>
                                <th className="p-2">Description</th>
                                <th className="p-2">Amount</th>
                                <th className="p-2">Condition of PPE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {form.items.map((item, index) => (
                                <tr key={index}>
                                    <td className="p-2">
                                        <input aria-label="Date Acquired" type="date" value={item.dateAcquired} onChange={(e) => updateItem(index, 'dateAcquired', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Property Number" value={item.propertyNumber} onChange={(e) => updateItem(index, 'propertyNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Amount" type="number" value={item.amount} onChange={(e) => updateItem(index, 'amount', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input aria-label="Condition of PPE" value={item.condition} onChange={(e) => updateItem(index, 'condition', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button type="button" onClick={addItem} className="mt-3 rounded-xl border px-3 py-2">Add item</button>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Remarks</span>
                        <textarea value={form.remarks} onChange={(e) => update('remarks', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Reason for Transfer</span>
                        <textarea value={form.reasonForTransfer} onChange={(e) => update('reasonForTransfer', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {signatoryFields('Approved By', 'approvedBy')}
                    {signatoryFields('Issued By', 'issuedBy')}
                    {signatoryFields('Received By', 'receivedBy')}
                </div>

                <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                    {saving ? <Spinner size={16} /> : <Send size={16} />}
                    {saving ? 'Saving…' : (editingId ? 'Update PTR' : 'Create PTR')}
                </button>
            </motion.form>
        </div>
    );
}
