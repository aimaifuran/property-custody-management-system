import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import UserAccountSelect from '../components/UserAccountSelect';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import Pagination from '../components/Pagination';
import { FileText, Printer } from 'lucide-react';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const FIXED_PURPOSES = ['Disposal', 'Repair', 'Returned To Stock'];

const emptyItem = () => ({
    ris: '',
    risItem: '',
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

const newForm = () => ({
    ...initial,
    items: [emptyItem()],
    returnedBy: getStickySignatory('returnedBy', emptySignatory()),
    returnedTo: getStickySignatory('returnedTo', emptySignatory())
});

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
    lguName: record.lguName || '',
    purposeChoice: FIXED_PURPOSES.includes(record.purpose) ? record.purpose : 'Other',
    purposeOther: FIXED_PURPOSES.includes(record.purpose) ? '' : (record.purpose || ''),
    items: record.items && record.items.length ? record.items.map((item) => ({
        ris: item.ris || '',
        risItem: item.risItem || '',
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
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [reports, setReports] = useState([]);
    const [processing, setProcessing] = useState('');
    const [rejectionReasons, setRejectionReasons] = useState({});
    const [issuedRecords, setIssuedRecords] = useState([]);
    const [form, setForm] = useState(newForm);
    const [editingId, setEditingId] = useState(null);
    const [editorOpen, setEditorOpen] = useState(true);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(reports, search);
    const { editorRef, recordsRef, updatedId, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);

    const load = async () => {
      setPageLoading(true);
      setPageLoadError('');
      try {

        const { data } = await axios.get('/prs');
        setReports(data.data || []);

      } catch (error) {
        setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        setPageLoading(false);
      }
    };

    useEffect(() => {
        load();
        axios.get('/ris').then(({ data }) => setIssuedRecords((data.data || []).filter(record => ['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(record.status)))).catch(() => toast.error('Unable to load issued items for return linking'));
    }, []);
    useEffect(() => {
        const refresh = () => { if (!document.hidden) load().catch(() => {}); };
        const timer = window.setInterval(refresh, 15000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, []);
    const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleReports = filteredReports.slice((page - 1) * perPage, page * perPage);

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => {
        const signatory = { ...prev[section], [key]: value, ...(key === 'name' ? { user: undefined } : {}) };
        saveStickySignatory(section, signatory, key);
        return { ...prev, [section]: signatory };
    });

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
        setEditorOpen(true);
        setEditingId(record._id);
        setForm(toForm(record));
    };

    const processReturn = async (record, action) => {
        setProcessing(record._id);
        try {
            await axios.post(`/prs/${record._id}/${action}`, action === 'reject' ? { reason: rejectionReasons[record._id] } : {});
            toast.success(action === 'confirm' ? 'Return confirmed and automatically recorded' : 'Return rejected');
            await load();
        } catch (error) { toast.error(error.response?.data?.message || 'Unable to process return'); }
        finally { setProcessing(''); }
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(newForm());
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
        try {
            if (editingId) {
                await axios.put(`/prs/${editingId}`, payload);
                toast.success('PRS updated');
                markUpdated(editingId);
            } else {
                await axios.post('/prs', payload);
                toast.success('PRS created. Each item logged to Returned Supply.');
            }
            setEditingId(null);
            setForm(newForm());
            load();
            if (editingId) scrollToRecords();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to save PRS');
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
      await exportOfficialFormPdf('PRS', data, print);
    };

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            <div ref={recordsRef} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}><NewFormButton onNew={() => { cancelEdit(); setEditorOpen(true); }} editorRef={editorRef} /></SavedReportsHeader>
                {reports.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Return Slips yet.</p>}
                {visibleReports.map((item) => (
                    <div key={item._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === item._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}>
                        <div>
                            <b>{item.lguName || 'No LGU'}</b>
                            <div className="text-sm text-slate-500">
                                {item.purpose || 'N/A'} · {item.items?.length || 0} item(s)
                            </div>
                            <div className="mt-1 text-sm font-semibold">{item.returnedBy?.name || 'Unnamed return'} · {item.status === 'PENDING' ? 'Awaiting confirmation' : item.status === 'REJECTED' ? 'Rejected' : 'Returned'}</div>
                            {item.submittedBy && <div className="mt-2 text-sm text-slate-600">{item.items.map((entry, index) => <div key={index}>{entry.description} · Qty {entry.quantity} · {entry.mrNumber}</div>)}</div>}
                            {item.rejectionReason && <div className="text-sm text-rose-700">{item.rejectionReason}</div>}
                        </div>
                        <div className="flex gap-2">
                            {!item.submittedBy && <RecordActionButton action="edit" title="Update record" onClick={() => startEdit(item)} />}
                            {item.status === 'PENDING' && <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!!processing} onClick={() => processReturn(item, 'confirm')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50">{processing === item._id ? <Skeleton className="h-4 w-24" /> : 'Confirm receipt'}</button><input aria-label="Return rejection reason" placeholder="Reason if rejected" value={rejectionReasons[item._id] || ''} onChange={event => setRejectionReasons(prev => ({ ...prev, [item._id]: event.target.value }))} className="rounded-lg border p-2 text-sm" /><button type="button" disabled={!!processing || !rejectionReasons[item._id]?.trim()} onClick={() => processReturn(item, 'reject')} className="rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700 disabled:opacity-50">{processing === item._id ? <Skeleton className="h-4 w-12" /> : 'Reject'}</button></div>}
                            {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(item)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(item, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>

            {editorOpen && (<motion.form ref={editorRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="form-document form-frame scroll-mt-6 p-6">
                <FormEditorHeader title="Property Return Slip" description="Saving a PRS automatically logs each item individually to Returned Supply." onClose={() => { cancelEdit(); setEditorOpen(false); scrollToRecords(); }} />
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

                <TableScroll className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="p-2">Issued item / User</th>
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
                                        <select aria-label="Issued item to return" value={item.ris && item.risItem ? `${item.ris}:${item.risItem}` : ''} onChange={(e) => {
                                            const [risId, itemId] = e.target.value.split(':');
                                            const record = issuedRecords.find(row => row._id === risId);
                                            const issued = record?.items.find(row => row._id === itemId);
                                            setForm(prev => ({ ...prev, returnedBy: record ? { ...prev.returnedBy, user: record.requestedBy?.user || record.receivedBy?.user, name: record.requestedBy?.name || record.receivedBy?.name || '' } : prev.returnedBy, items: prev.items.map((row, i) => i === index ? { ...row, ris: risId || '', risItem: itemId || '', ...(issued ? { description: issued.description || '', unit: issued.unit || '', mrNumber: record.risNumber || '' } : {}) } : row) }));
                                        }} className="w-64 rounded-xl border border-slate-200 px-2 py-2">
                                            <option value="">Unlinked return (not shown to users)</option>
                                            {issuedRecords.filter(record => !form.returnedBy.user || String(record.requestedBy?.user || record.receivedBy?.user) === String(form.returnedBy.user)).flatMap(record => record.items.filter(row => row.quantityIssued > 0).map(row => <option key={`${record._id}:${row._id}`} value={`${record._id}:${row._id}`}>{record.requestedBy?.name || record.receivedBy?.name} · {record.risNumber} · {row.description || row.stockNumber} (issued {row.quantityIssued})</option>))}
                                        </select>
                                    </td>
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
                </TableScroll>
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
                    <div><UserAccountSelect person={form.returnedBy} onChange={person => setForm(prev => ({ ...prev, returnedBy: person, items: [emptyItem()] }))} />{signatoryFields('Returned By', 'returnedBy')}</div>
                    {signatoryFields('Returned To', 'returnedTo')}
                </div>

                <button type="submit" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white">
                    <RotateCcw size={16} />
                    {editingId ? 'Update PRS' : 'Create PRS'}
                </button>
            </motion.form>)}
        </div>
    );
}
