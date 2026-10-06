import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import EntityNameField from '../components/EntityNameField';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import FundClusterField from '../components/FundClusterField';
import Pagination from '../components/Pagination';
import { FileText, Printer, RotateCcw } from 'lucide-react';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

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
    office: record.office || '',
    fundCluster: record.fundCluster || '',
    parNumber: record.parNumber || '',
    items: record.items && record.items.length ? record.items.map(toFormItem) : [emptyItem()],
    remarks: record.remarks || '',
    receivedBy: toFormSignatory(record.receivedBy),
    issuedBy: toFormSignatory(record.issuedBy)
});

export default function ParPage() {
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [records, setRecords] = useState([]);
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

        const { data } = await axios.get('/par');
        setRecords(data.data || []);

      } catch (error) {
        setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        setPageLoading(false);
      }
    };

    useEffect(() => { load(); }, []);
    const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleRecords = filteredReports.slice((page - 1) * perPage, page * perPage);

    const startEdit = (record) => {
        setEditingId(record._id);
        const nextForm = toForm(record);
        nextForm.receivedBy = getStickySignatory('receivedBy', nextForm.receivedBy);
        nextForm.issuedBy = getStickySignatory('issuedBy', nextForm.issuedBy);
        if (nextForm.parNumber) {
            setForm(nextForm);
        } else {
            axios.get('/document-numbers/PAR')
                .then(({ data }) => setForm({ ...nextForm, parNumber: data.data.nextNumber }))
                .catch(() => setForm(nextForm));
        }
    };

    const createNew = async () => {
        setEditingId(null);
        const nextForm = toForm({ items: [emptyItem()] });
        setForm(nextForm);
        try {
            const { data } = await axios.get('/document-numbers/PAR');
            setForm(previous => ({ ...previous, parNumber: data.data.nextNumber }));
        } catch { /* The document number can also be entered manually. */ }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(null);
    };

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => {
        const signatory = { ...prev[section], [key]: value };
        saveStickySignatory(section, signatory, key);
        return { ...prev, [section]: signatory };
    });

    const updateItem = (index, key, value) => setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const total = (form?.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const save = async (event) => {
        event.preventDefault();
        try {
            await axios[editingId ? 'put' : 'post'](editingId ? `/par/${editingId}` : '/par', {
                ...form,
                items: form.items.map((item) => ({
                    ...item,
                    quantity: Number(item.quantity || 0),
                    amount: Number(item.amount || 0)
                }))
            });
            toast.success(editingId ? 'Property Acknowledgement Receipt updated' : 'Property Acknowledgement Receipt created');
            markUpdated(editingId);
            cancelEdit();
            load();
            scrollToRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save PAR');
        }
    };

    const field = (label, key, type = 'text') => key === 'entityName' ? <EntityNameField value={form.entityName} onChange={value => update('entityName', value)} isNew={!editingId} /> : (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input type={type} placeholder={key === 'entityName' ? 'e.g., Municipality of Carigara' : key === 'fundCluster' ? 'e.g., General Fund' : key === 'parNumber' ? 'e.g., PAR-2026-001' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
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
      await exportOfficialFormPdf('PAR', data, print);
    };

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            <div ref={recordsRef} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}><NewFormButton onNew={createNew} editorRef={editorRef} /></SavedReportsHeader>
                {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Acknowledgement Receipt records yet.</p>}
                {visibleRecords.map((record) => (
                    <div key={record._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === record._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}>
                        <div>
                            <b>{record.parNumber || 'Unassigned PAR No.'}</b>
                            <div className="text-sm text-slate-500">
                                {record.entityName || 'No entity'} · Total: {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <RecordActionButton action="edit" title="Update record" onClick={() => startEdit(record)} />
                            {/* <button type="button" onClick={() => generateDoc(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(record)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(record, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>

            {form && (
                <form ref={editorRef} onSubmit={save} className="form-document form-frame scroll-mt-6 p-6">
                    <FormEditorHeader title="Property Acknowledgement Receipt" description="Records here are created automatically from IAR items whose combined total cost is ₱50,000 or more." onClose={cancelEdit} />
                    <div className="grid gap-3 md:grid-cols-3">
                        {field('Entity Name', 'entityName')}
                        <FundClusterField value={form.fundCluster} onChange={(value) => update('fundCluster', value)} />
                        {field('PAR No.', 'parNumber')}{field('Office', 'office')}
                    </div>
                    <TableScroll className="mt-6 overflow-x-auto">
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
                    </TableScroll>
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

                    <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white">{editingId ? 'Save Changes' : 'Save New Form'}</button>
                </form>
            )}
        </div>
    );
}
