import { sortSavedReports } from '../utils/savedReportOrder';
import useSavedReportPage from '../utils/useSavedReportPage';
import NewFormBadge from '../components/NewFormBadge';
import { useAuth } from '../contexts/AuthContext';
import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import UserAccountSelect from '../components/UserAccountSelect';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useRef, useState } from 'react';
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
import useDocumentNumberPreview from '../utils/useDocumentNumberPreview';

const FIXED_PURPOSES = ['Disposal', 'Repair', 'Returned To Stock'];

const emptyItem = () => ({
    accountability: '',
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
    prsNumber: '',
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
    prsNumber: record.prsNumber || '',
    lguName: record.lguName || '',
    purposeChoice: FIXED_PURPOSES.includes(record.purpose) ? record.purpose : 'Other',
    purposeOther: FIXED_PURPOSES.includes(record.purpose) ? '' : (record.purpose || ''),
    items: record.items && record.items.length ? record.items.map((item) => ({
        accountability: item.accountability || '',
        ris: item.ris || '',
        risItem: item.risItem || '',
        quantity: item.quantity ?? '',
        unit: item.unit || '',
        description: item.description || '',
        propertyNumber: item.propertyNumber || '',
        mrNumber: item.mrNumber || '',
        condition: item.condition || 'Serviceable',
        unitValue: item.unitValue ?? '',
        totalValue: item.totalValue ?? 0
    })) : [emptyItem()],
    note: record.note || '',
    returnedBy: toFormSignatory(record.returnedBy),
    returnedTo: toFormSignatory(record.returnedTo)
});

export default function PrsPage() {
    const { user } = useAuth();
    const isUser = user?.role !== 'admin';
    const makeForm = () => ({ ...newForm(), ...(isUser ? { returnedBy: { user: user?._id, name: [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || user?.username, designation: user?.office, date: new Date().toISOString().slice(0, 10) } } : {}) });
    const [decision, setDecision] = useState('receive');
    const [rejectionReason, setRejectionReason] = useState('');
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [reports, setReports] = useState([]);
    const [processing, setProcessing] = useState('');
    const [conditions, setConditions] = useState({});
    const [issuedRecords, setIssuedRecords] = useState([]);
    const [approvedRecords, setApprovedRecords] = useState([]);
    const [finalizingRis, setFinalizingRis] = useState('');
    const [issuanceError, setIssuanceError] = useState('');
    const [issuedLoading, setIssuedLoading] = useState(true);
    const [issuedError, setIssuedError] = useState('');
    const [form, setForm] = useState(makeForm);
    const { refreshNumberPreview, cancelNumberPreview } = useDocumentNumberPreview('PRS', 'prsNumber', setForm);
    const [editingId, setEditingId] = useState(null);
    const activeRecord = reports.find(record => record._id === editingId);
    const workflow = !!activeRecord?.submittedBy;
    const readOnly = !!activeRecord && (isUser || workflow);
    const canReceive = !isUser && workflow && activeRecord.status === 'PENDING';
    const canCorrectSignatory = !isUser && workflow && activeRecord.status === 'RETURNED';
    const [editorOpen, setEditorOpen] = useState(true);
    const loadingRecords = useRef(false);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(sortSavedReports(reports), search);
    const { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    useSavedReportPage(filteredReports, savedUpdate, perPage, setPage);

    const load = async (background = false) => {
      if (loadingRecords.current) return;
      loadingRecords.current = true;
      if (!background) { setPageLoading(true); setPageLoadError(''); }
      try {

        const { data } = await axios.get('/prs');
        setReports(data.data || []);

      } catch (error) {
        if (!background) setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        loadingRecords.current = false;
        if (!background) setPageLoading(false);
      }
    };

    useEffect(() => {
        load();
        refreshNumberPreview();
    }, []);
    const loadIssued = async () => {
        setIssuedLoading(true); setIssuedError('');
        try {
            if (isUser) {
                const [assets, issued] = await Promise.all([axios.get('/custody/assets'), axios.get('/ris/my-returns')]);
                const person = makeForm().returnedBy;
                const assetRows = (assets.data.data || []).map(asset => ({ _id: asset.ris || asset._id, risNumber: asset.documentNumber, requestedBy: person, items: [{ _id: asset.risItem || asset._id, accountability: asset._id, description: asset.inventory?.item?.description, unit: asset.inventory?.item?.unit, quantityRemaining: asset.quantityRemaining, unitCost: asset.inventory?.unitCost, propertyNumber: asset.propertyNumber || asset.inventory?.item?.stockNumber, pendingMovement: asset.pendingMovement }] }));
                const otherRows = (issued.data.data || []).filter(row => row.quantityRemaining > 0 && !assetRows.some(record => String(record._id) === String(row.risId) && record.items.some(item => String(item._id) === String(row.itemId)))).map(row => ({ _id: row.risId, risNumber: row.risNumber, requestedBy: person, items: [{ _id: row.itemId, description: row.description, unit: row.unit || '', quantityRemaining: row.quantityRemaining, unitCost: row.unitCost || 0, propertyNumber: row.stockNumber, pendingMovement: row.pendingReturn }] }));
                setIssuedRecords([...assetRows, ...otherRows]); setApprovedRecords([]); return;
            }
            const [{ data }, { data: requests }] = await Promise.all([axios.get('/ris/returnable-items', { params: editingId ? { exclude: editingId } : {} }), axios.get('/ris')]);
            setApprovedRecords((requests.data || []).filter(record => record.status === 'APPROVED'));
            setIssuedRecords(data.data || []);
        } catch { setIssuedError('Unable to load issued items. Retry before saving a linked return.'); }
        finally { setIssuedLoading(false); }
    };
    useEffect(() => { loadIssued(); }, [editingId, form.returnedBy.user]);
    const accountId = person => String(person?.user?._id || person?.user || '');
    const eligibleRecords = issuedRecords.filter(record => !accountId(form.returnedBy) || accountId(record.requestedBy?.user ? record.requestedBy : record.receivedBy) === accountId(form.returnedBy));
    const awaitingIssuance = approvedRecords.filter(record => accountId(form.returnedBy) && accountId(record.requestedBy?.user ? record.requestedBy : record.receivedBy) === accountId(form.returnedBy));
    const finalizeIssuance = async record => {
        setFinalizingRis(record._id); setIssuanceError('');
        try {
            await axios.post(`/ris/${record._id}/approve`);
            await loadIssued();
            toast.success('Issuance completed. Select the item below to return it.');
        } catch (error) { setIssuanceError(error.response?.data?.message || 'Unable to complete issuance.'); }
        finally { setFinalizingRis(''); }
    };
    useEffect(() => { setIssuanceError(''); }, [form.returnedBy.user]);
    useEffect(() => {
        if (editorOpen) return;
        const refresh = () => { if (!document.hidden) load(true); };
        const timer = window.setInterval(refresh, 15000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, [editorOpen]);
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
        cancelNumberPreview();
        setEditorOpen(true);
        setEditingId(record._id);
        const nextForm = toForm(record);
        if (!isUser && record.submittedBy && record.status === 'PENDING') {
            nextForm.returnedTo = {
                ...nextForm.returnedTo,
                name: nextForm.returnedTo.name || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || user?.username || '',
                designation: nextForm.returnedTo.designation || user?.office || '',
                date: nextForm.returnedTo.date || new Date().toISOString().slice(0, 10),
            };
        }
        setForm(nextForm); setDecision('receive'); setRejectionReason('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(makeForm()); setDecision('receive'); setRejectionReason('');
        refreshNumberPreview();
    };

    const save = async (event) => {
        event.preventDefault();
        if (processing) return;
        if (!readOnly && accountId(form.returnedBy) && (issuedLoading || issuedError)) return toast.error('Wait for the issued items to load, or retry loading them.');
        if (!readOnly && accountId(form.returnedBy) && form.items.some(item => !item.accountability && (!item.ris || !item.risItem))) return toast.error('Select an issued item in each row. A recorded request must be issued before it can be returned.');
        const purpose = form.purposeChoice === 'Other' ? form.purposeOther : form.purposeChoice;
        const payload = {
            prsNumber: form.prsNumber,
            ...(!editingId ? { autoNumber: true } : {}),
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
        setProcessing(editingId || 'new');
        try {
            if (canReceive) {
                await axios.post(`/prs/${editingId}/${decision === 'reject' ? 'reject' : 'confirm'}`, decision === 'reject' ? { reason: rejectionReason } : { conditions, returnedTo: form.returnedTo });
                toast.success(decision === 'reject' ? 'Return rejected' : 'Physical receipt confirmed; stock and accountability updated');
            } else if (canCorrectSignatory) {
                await axios.put(`/prs/${editingId}`, { returnedTo: form.returnedTo });
                toast.success('Returned To signatory updated');
                markUpdated(editingId);
            } else if (isUser && !editingId) {
                const entry = payload.items[0];
                if (!entry) throw new Error('Select a property or supply to return');
                await axios.post(entry.accountability ? '/custody/returns' : '/ris/my-returns', entry.accountability ? { accountability: entry.accountability, quantity: entry.quantity, note: form.note } : { risId: entry.ris, itemId: entry.risItem, quantity: entry.quantity });
                toast.success('PRS submitted; awaiting admin receipt');
            } else if (editingId) {
                await axios.put(`/prs/${editingId}`, payload);
                toast.success('PRS updated');
                markUpdated(editingId);
            } else {
                await axios.post('/prs', payload);
                toast.success('PRS created. Each item logged to Returned Supply.');
            }
            setSearch('');
            cancelEdit();
            load(true);
            loadIssued();
            if (editingId) scrollToRecords();
        } catch (error) {
            toast.error(error?.response?.data?.message || error.message || 'Unable to save PRS');
        } finally { setProcessing(''); }
    };

    const signatoryFields = (label, section, disabled = false) => (
        <fieldset disabled={disabled} className="min-w-0 rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">{label}</h3>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Date</span>
                    <input aria-label={`${label} Date`} type="date" value={form[section].date} onChange={(e) => updateSignatory(section, 'date', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
                    <input aria-label={`${label} Name`} value={form[section].name} onChange={(e) => updateSignatory(section, 'name', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Designation</span>
                    <input aria-label={`${label} Designation`} value={form[section].designation} onChange={(e) => updateSignatory(section, 'designation', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
            </div>
        </fieldset>
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
                    <div key={item._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === item._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}><NewFormBadge record={item} />
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
                            <RecordActionButton action="edit" title={item.submittedBy ? "Open return form" : "Update record"} onClick={() => startEdit(item)} />
                            {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(item)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(item, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>

            {editorOpen && (<motion.form ref={editorRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} aria-busy={Boolean(processing)} inert={processing ? true : undefined} className="form-document form-frame scroll-mt-6 p-6">
                <FormEditorHeader title="Property Return Slip" description="Saving a PRS automatically logs each item individually to Returned Supply." onClose={() => { cancelEdit(); setEditorOpen(false); scrollToRecords(); }} />
                <fieldset disabled={readOnly} className="min-w-0">
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">PRS No.</span>
                        <input aria-label="PRS No." readOnly={!editingId} value={form.prsNumber} onChange={(e) => update('prsNumber', e.target.value)} placeholder="Assigned on save" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
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

                <div className="mt-4">
                    {!isUser && <UserAccountSelect person={form.returnedBy} onChange={person => setForm(prev => ({ ...prev, returnedBy: person, items: prev.items.map(item => ({ ...item, ris: '', risItem: '', mrNumber: '' })) }))} />}
                    {issuedLoading ? <Skeleton className="h-4 w-48" label="Loading issued items" /> : issuedError ? <p role="alert" className="text-rose-700">{issuedError} <button type="button" onClick={loadIssued}>Retry</button></p> : accountId(form.returnedBy) && !eligibleRecords.length ? <p role="alert" className="text-amber-800">{awaitingIssuance.length ? 'This account has an approved RIS awaiting completed issuance.' : 'No outstanding issued items are available for this account.'}</p> : <p className="text-slate-500">Select the exact issued item below. Its details and remaining quantity will fill automatically.</p>}
                </div>
                {!issuedLoading && awaitingIssuance.map(record => <div key={record._id} className="mt-2 flex flex-wrap items-center gap-2">
                    <span>RIS {record.risNumber} - approved, awaiting issuance</span>
                    <button type="button" disabled={Boolean(finalizingRis)} onClick={() => finalizeIssuance(record)} className="rounded-lg bg-teal-600 px-3 py-2 text-white disabled:opacity-50">{finalizingRis === record._id ? 'Completing issuance...' : 'Complete issuance'}</button>
                    <a href="/ris" className="underline">Edit RIS quantities</a>
                </div>)}
                {issuanceError && <p role="alert" className="mt-2 text-rose-700">{issuanceError} Open the RIS and correct its quantities before completing issuance.</p>}
                <TableScroll className="mt-4 overflow-x-auto">
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
                                        <select aria-label="Issued item to return" required={Boolean(accountId(form.returnedBy))} disabled={issuedLoading || Boolean(issuedError)} value={item.ris && item.risItem ? `${item.ris}:${item.risItem}` : ''} onChange={(e) => {
                                            const [risId, itemId] = e.target.value.split(':');
                                            const record = issuedRecords.find(row => row._id === risId);
                                            const issued = record?.items.find(row => row._id === itemId);
                                            const quantity = issued ? Math.min(Number(item.quantity) || issued.quantityRemaining, issued.quantityRemaining) : item.quantity;
                                            setForm(prev => ({ ...prev, returnedBy: record ? { ...prev.returnedBy, user: record.requestedBy?.user || record.receivedBy?.user, name: record.requestedBy?.name || record.receivedBy?.name || '', designation: record.requestedBy?.designation || record.receivedBy?.designation || prev.returnedBy.designation } : prev.returnedBy, items: prev.items.map((row, i) => i === index ? { ...row, accountability: issued?.accountability || '', ris: risId || '', risItem: itemId || '', ...(issued ? { description: issued.description || '', unit: issued.unit || '', mrNumber: record.risNumber || '', propertyNumber: issued.propertyNumber || '', unitValue: issued.unitCost, quantity, totalValue: quantity * issued.unitCost } : {}) } : row) }));
                                        }} className="w-64 rounded-xl border border-slate-200 px-2 py-2">
                                            <option value="">{accountId(form.returnedBy) ? 'Select issued item to return' : 'Select issued item / manual historical return'}</option>
                                            {eligibleRecords.flatMap(record => record.items.map(row => <option key={`${record._id}:${row._id}`} value={`${record._id}:${row._id}`}>{record.requestedBy?.name || record.receivedBy?.name} · {record.risNumber} · {row.description || row.stockNumber} (remaining {row.quantityRemaining})</option>))}
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
                {!isUser && !readOnly && <button type="button" onClick={addItem} className="mt-3 rounded-xl border px-3 py-2">Add item</button>}

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

                </fieldset>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {signatoryFields('Returned By', 'returnedBy', readOnly)}
                    {signatoryFields('Returned To', 'returnedTo', readOnly && !canReceive && !canCorrectSignatory)}
                </div>
                {activeRecord && <p className="mt-4 text-sm">Status: {activeRecord.status || 'RETURNED'}{activeRecord.rejectionReason ? ` - ${activeRecord.rejectionReason}` : ''}</p>}
                {canReceive && <div className="mt-4 space-y-3"><label className="block">Receipt decision<select value={decision} onChange={event => setDecision(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="receive">Confirm physical receipt</option><option value="reject">Reject return</option></select></label>{decision === 'receive' ? activeRecord.items.map(entry => <label key={entry._id} className="block">{entry.description}: inspected condition<select value={conditions[entry._id] || 'Serviceable'} onChange={event => setConditions(previous => ({ ...previous, [entry._id]: event.target.value }))} className="mt-1 w-full rounded-lg border p-2"><option>Serviceable</option><option>Unserviceable</option></select></label>) : <label className="block">Reason for rejection<textarea required value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>}</div>}
                <button type="submit" disabled={!!processing || (readOnly && !canReceive && !canCorrectSignatory) || (!readOnly && Boolean(accountId(form.returnedBy)) && (issuedLoading || Boolean(issuedError) || !eligibleRecords.length))} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-50">
                    <RotateCcw size={16} />
                    {processing ? 'Saving...' : canReceive ? decision === 'reject' ? 'Reject PRS' : 'Confirm Receipt' : canCorrectSignatory ? 'Update PRS' : readOnly ? 'Recorded Return' : isUser ? 'Submit PRS' : editingId ? 'Update PRS' : 'Create PRS'}
                </button>
            </motion.form>)}
        </div>
    );
}
