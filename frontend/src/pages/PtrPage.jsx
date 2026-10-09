import ValidatedForm from '../components/ValidatedForm';
import { sortSavedReports } from '../utils/savedReportOrder';
import useSavedReportPage from '../utils/useSavedReportPage';
import NewFormBadge from '../components/NewFormBadge';
import { useAuth } from '../contexts/AuthContext';
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
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
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
import useDocumentNumberPreview from '../utils/useDocumentNumberPreview';

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

const newForm = () => ({
    ...initial,
    items: [emptyItem()],
    approvedBy: getStickySignatory('approvedBy', emptySignatory()),
    issuedBy: getStickySignatory('issuedBy', emptySignatory()),
    receivedBy: getStickySignatory('receivedBy', emptySignatory())
});

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
    const { user } = useAuth();
    const isUser = user?.role !== 'admin';
    const makeForm = () => ({ ...newForm(), fromAccountableOfficer: isUser ? [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || user?.username : '', toUser: '' });
    const [assets, setAssets] = useState([]);
    const [people, setPeople] = useState([]);
    const [saving, setSaving] = useState(false);
    const [decision, setDecision] = useState('confirm');
    const [rejectionReason, setRejectionReason] = useState('');
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [reports, setReports] = useState([]);
    const [form, setForm] = useState(makeForm);
    const { refreshNumberPreview, cancelNumberPreview } = useDocumentNumberPreview('PTR', 'ptrNumber', setForm);
    const [editingId, setEditingId] = useState(null);
    const activeRecord = reports.find(record => record._id === editingId);
    const workflow = !!activeRecord?.fromUser;
    const canProcess = workflow && (isUser ? String(activeRecord.toUser) === String(user?._id) && activeRecord.status === 'PENDING_RECEIVER' : ['PENDING_RECEIVER', 'PENDING_ADMIN'].includes(activeRecord.status) && (decision === 'reject' || activeRecord.status === 'PENDING_ADMIN'));
    const [editorOpen, setEditorOpen] = useState(true);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(sortSavedReports(reports), search);
    const { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    useSavedReportPage(filteredReports, savedUpdate, perPage, setPage);

    const load = async () => {
      setPageLoading(true);
      setPageLoadError('');
      try {

        const [records, inventory, users] = await Promise.all([axios.get('/ptr'), axios.get('/custody/assets'), axios.get('/custody/people')]);
        setReports(records.data.data || []); setAssets(inventory.data.data || []); setPeople(users.data.data || []);

      } catch (error) {
        setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        setPageLoading(false);
      }
    };


    useEffect(() => {
        load();
        refreshNumberPreview();
    }, []);
    const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleReports = filteredReports.slice((page - 1) * perPage, page * perPage);

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

    const startEdit = (record) => {
        cancelNumberPreview();
        setEditorOpen(true);
        setEditingId(record._id);
        setForm(toForm(record)); setDecision('confirm'); setRejectionReason('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(makeForm()); setDecision('confirm'); setRejectionReason('');
        refreshNumberPreview();
    };

    const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        const transferType = form.transferTypeChoice === 'Other' ? form.transferTypeOther : form.transferTypeChoice;
        const payload = {
            ...(!editingId ? { autoNumber: true } : {}),
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
            if (workflow) {
                const action = decision === 'reject' ? 'reject' : isUser ? 'receive' : 'approve';
                await axios.post(`/custody/transfers/${editingId}/${action}`, action === 'reject' ? { reason: rejectionReason } : {});
                toast.success(action === 'receive' ? 'Receipt confirmed; awaiting admin approval' : action === 'approve' ? 'Transfer approved and accountability reassigned' : 'Transfer rejected');
            } else if (isUser) {
                await axios.post('/custody/transfers', { accountability: form.items[0]?.accountability, toUser: form.toUser, reason: form.reasonForTransfer, entityName: form.entityName, fundCluster: form.fundCluster, transferType, remarks: form.remarks });
                toast.success('PTR sent to the receiving custodian');
            } else if (editingId) {
                await axios.put(`/ptr/${editingId}`, payload);
                toast.success('PTR updated');
                markUpdated(editingId);
            } else {
                await axios.post('/ptr', payload);
                toast.success('PTR created');
            }
            setSearch('');
            setEditingId(null);
            setForm(makeForm()); setDecision('confirm'); setRejectionReason('');
            refreshNumberPreview();
            load();
            if (editingId) scrollToRecords();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to save PTR');
        } finally { setSaving(false); }
    };

    const field = (label, key, type = 'text') => key === 'toAccountableOfficer' && isUser && !editingId ? <label className="block"><span className="mb-1 block text-sm font-semibold">{label}</span><select required value={form.toUser || ''} onChange={event => { const person = people.find(row => row._id === event.target.value); setForm(previous => ({ ...previous, toUser: event.target.value, toAccountableOfficer: person?.name || '' })); }} className="w-full rounded-xl border p-2"><option value="">Select receiving custodian</option>{people.map(person => <option key={person._id} value={person._id}>{person.name} - {person.office}</option>)}</select></label> : key === 'entityName' ? <EntityNameField value={form.entityName} onChange={value => update('entityName', value)} isNew={!editingId} /> : (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input required aria-label={label} readOnly={(key === 'ptrNumber' && !editingId) || (isUser && key === 'fromAccountableOfficer')} type={type} placeholder={key === 'entityName' ? 'e.g., Municipality of Carigara' : key === 'fundCluster' ? 'e.g., General Fund' : key === 'ptrNumber' ? 'Assigned on save' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    );

    const signatoryFields = (label, section) => (
        <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">{label}</h3>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
                    <input required value={form[section].name} onChange={(e) => updateSignatory(section, 'name', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Designation</span>
                    <input required value={form[section].designation} onChange={(e) => updateSignatory(section, 'designation', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Date</span>
                    <input required type="date" value={form[section].date} onChange={(e) => updateSignatory(section, 'date', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
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
      await exportOfficialFormPdf('PTR', data, print);
    };

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            <div ref={recordsRef} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}><NewFormButton onNew={() => { cancelEdit(); setEditorOpen(true); }} editorRef={editorRef} /></SavedReportsHeader>
                {reports.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Transfer Reports yet.</p>}
                {visibleReports.map((item) => (
                    <div key={item._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === item._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}><NewFormBadge record={item} />
                        <div>
                            <b>{item.ptrNumber}</b><p className="mt-1 text-sm">{item.status?.replaceAll('_', ' ')}</p>
                            <div className="text-sm text-slate-500">
                                {item.fromAccountableOfficer || 'N/A'} {'->'} {item.toAccountableOfficer || 'N/A'} · {item.transferType || 'N/A'}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <RecordActionButton action="edit" title={item.fromUser ? "Open transfer form" : "Update record"} onClick={() => startEdit(item)} />
                            {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(item)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(item, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>

            {editorOpen && (<ValidatedForm as={motion.form} ref={editorRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} aria-busy={saving} inert={saving ? true : undefined} className="form-document form-frame scroll-mt-6 p-6">
                <FormEditorHeader title="Property Transfer Report" description="Transfer an accountable asset to another custodian." onClose={() => { cancelEdit(); setEditorOpen(false); scrollToRecords(); }} />
                <fieldset disabled={workflow} className="min-w-0">
                <div className="grid gap-3 md:grid-cols-3">
                    {field('Entity Name', 'entityName')}
                    <FundClusterField value={form.fundCluster} onChange={(value) => update('fundCluster', value)} />
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
                        <input required
                            value={form.transferTypeOther}
                            onChange={(e) => update('transferTypeOther', e.target.value)}
                            placeholder="Specify transfer type"
                            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 md:w-1/2"
                        />
                    )}
                </div>

                <TableScroll className="mt-6 overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-left">
                                <th className="p-2">Date Acquired <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Property No. <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Description <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Amount <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Condition of PPE <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {form.items.map((item, index) => (
                                <tr key={index}>
                                    <td className="p-2">
                                        <input required readOnly={isUser} aria-label="Date Acquired" type="date" value={item.dateAcquired} onChange={(e) => updateItem(index, 'dateAcquired', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        {isUser && !editingId ? <select required aria-label="Property to transfer" value={item.accountability || ''} onChange={event => { const asset = assets.find(row => row._id === event.target.value); setForm(previous => ({ ...previous, items: [asset ? { accountability: asset._id, dateAcquired: toDateInputValue(asset.inventory?.purchaseDate), propertyNumber: asset.propertyNumber || asset.inventory?.item?.stockNumber || '', description: asset.inventory?.item?.description || '', amount: asset.quantityRemaining * Number(asset.inventory?.unitCost || 0), condition: asset.condition || 'Serviceable' } : emptyItem()] })); }} className="w-full rounded-xl border p-2"><option value="">Select your accepted property</option>{assets.map(asset => <option key={asset._id} value={asset._id} disabled={!asset.acceptedAt || !!asset.pendingMovement}>{asset.inventory?.item?.description} - {asset.documentNumber}{!asset.acceptedAt ? ' (accept ICS/PAR first)' : asset.pendingMovement ? ' (pending movement)' : ''}</option>)}</select> : <input required aria-label="Property Number" value={item.propertyNumber} onChange={(e) => updateItem(index, 'propertyNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />}
                                    </td>
                                    <td className="p-2">
                                        <input required readOnly={isUser} aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input required readOnly={isUser} aria-label="Amount" type="number" min="0" step="any" value={item.amount} onChange={(e) => updateItem(index, 'amount', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input required readOnly={isUser} aria-label="Condition of PPE" value={item.condition} onChange={(e) => updateItem(index, 'condition', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TableScroll>
                {!isUser && !workflow && <button type="button" onClick={addItem} className="mt-3 rounded-xl border px-3 py-2">Add item</button>}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Remarks (optional)</span>
                        <textarea value={form.remarks} onChange={(e) => update('remarks', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Reason for Transfer</span>
                        <textarea required value={form.reasonForTransfer} onChange={(e) => update('reasonForTransfer', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {signatoryFields('Approved By', 'approvedBy')}
                    {signatoryFields('Issued By', 'issuedBy')}
                    {signatoryFields('Received By', 'receivedBy')}
                </div>

                </fieldset>
                {workflow && <p className="mt-4 text-sm">Status: {activeRecord.status.replaceAll('_', ' ')}{activeRecord.rejectionReason ? ` - ${activeRecord.rejectionReason}` : ''}</p>}
                {workflow && (isUser ? String(activeRecord.toUser) === String(user?._id) && activeRecord.status === 'PENDING_RECEIVER' : ['PENDING_RECEIVER', 'PENDING_ADMIN'].includes(activeRecord.status)) && <label className="mt-4 block">Decision<select value={decision} onChange={event => setDecision(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="confirm">{isUser ? 'Confirm physical receipt' : 'Approve transfer after receiver confirmation'}</option><option value="reject">Reject transfer</option></select></label>}
                {workflow && decision === 'reject' && <label className="mt-3 block">Reason for rejection<textarea required value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>}
                <button type="submit" disabled={saving || (workflow && !canProcess)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white">
                    <Send size={16} />
                    {saving ? 'Saving...' : workflow ? decision === 'reject' ? 'Reject PTR' : canProcess ? isUser ? 'Confirm Receipt' : 'Approve PTR' : 'Awaiting / Recorded Transfer' : isUser ? 'Submit PTR' : editingId ? 'Update PTR' : 'Create PTR'}
                </button>
            </ValidatedForm>)}
        </div>
    );
}
