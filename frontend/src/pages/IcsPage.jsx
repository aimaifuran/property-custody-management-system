import UserAccountSelect from '../components/UserAccountSelect';
import SignatoryValue from '../components/SignatoryValue';
import useSourceDocument from '../utils/useSourceDocument';
import { withCurrentDates } from '../utils/formDates';
import IarSourceSelect from '../components/IarSourceSelect';
import { hasRowData } from '../utils/formRows';
import { lineAmount, sumAmounts } from '../utils/formAmounts';
import OfficeSelect from '../components/OfficeSelect';
import AddRowButton from '../components/AddRowButton';
import DeleteRowButton from '../components/DeleteRowButton';
import ValidatedForm from '../components/ValidatedForm';
import { sortSavedReports } from '../utils/savedReportOrder';
import useSavedReportPage from '../utils/useSavedReportPage';
import NewFormBadge from '../components/NewFormBadge';
import { useAuth } from '../contexts/AuthContext';
import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import EntityNameField from '../components/EntityNameField';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
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
import { getStickySignatory } from '../utils/stickySignatories';
import FundClusterField from '../components/FundClusterField';
import Pagination from '../components/Pagination';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const emptyItem = () => ({
    quantity: '',
    unit: '',
    unitCost: '',
    totalCost: 0,
    description: '',
    inventoryItemNo: '',
    estimatedUsefulLife: ''
});

const reportItemNames = record => {
    const names = (record.items || []).map(item => item.itemName || item.inventory?.item?.name || (item.inventory?.item?.category !== 'General' ? item.inventory?.item?.category : '')).filter(Boolean).map(name => String(name).trim()).filter(Boolean);
    return [...new Map(names.map(name => [name.toLocaleLowerCase(), name])).values()].join(', ') || 'Item name unavailable';
};

const toFormItem = (item = {}) => ({
    quantity: item.quantity ?? '',
    unit: item.unit || '',
    unitCost: item.unitCost ?? '',
    totalCost: lineAmount(item.quantity, item.unitCost),
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
    office: record.office || '',
    fundCluster: record.fundCluster || '',
    icsNumber: record.icsNumber || '',
    items: record.items && record.items.length ? record.items.map(toFormItem) : [],
    remarks: record.remarks || '',
    receivedFrom: toFormSignatory(record.receivedFrom),
    receivedBy: toFormSignatory(record.receivedBy)
});

export default function IcsPage() {
    const { user } = useAuth();
    const isUser = user?.role !== 'admin';
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [records, setRecords] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [viewOnly, setViewOnly] = useState(false);
    const [form, setForm] = useState(() => isUser ? null : withCurrentDates(toForm({ items: [emptyItem()] })));
    const [saving, setSaving] = useState(false);
    const selectedRecord = records.find(record => record._id === editingId);
    const readOnly = isUser || viewOnly;
    const linkedIssuance = !!(selectedRecord?.user || selectedRecord?.offlineRecipient);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const filteredReports = filterReports(sortSavedReports(records), search);
    const { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    useSavedReportPage(filteredReports, savedUpdate, perPage, setPage);

    const load = async () => {
      setPageLoading(true);
      setPageLoadError('');
      try {

        const { data } = await axios.get('/ics');
        setRecords(data.data || []);

      } catch (error) {
        setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        setPageLoading(false);
      }
    };

    useEffect(() => {
        load();
        const timer = window.setInterval(() => { if (!document.hidden) axios.get('/ics').then(({ data }) => setRecords(data.data || [])).catch(() => {}); }, 15000);
        return () => window.clearInterval(timer);
    }, []);
    const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleRecords = filteredReports.slice((page - 1) * perPage, page * perPage);

    const startEdit = (record, readOnlyView = false) => {
        setEditorOpen(true);
        setViewOnly(readOnlyView);
        setEditingId(record._id);
        const nextForm = toForm(record);
        if (!record.user) nextForm.receivedFrom = getStickySignatory('receivedFrom', nextForm.receivedFrom);
        setForm(nextForm);
    };

    const cancelEdit = () => {
        setEditorOpen(false);
        setViewOnly(false);
        setEditingId(null);
        setForm(null);
    };

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => {
        const signatory = { ...prev[section], [key]: value };
        return { ...prev, [section]: signatory };
    });

    const updateItem = (index, key, value) => setForm((prev) => {
        const items = prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item);
        if (key === 'quantity' || key === 'unitCost') {
            items[index].totalCost = lineAmount(items[index].quantity, items[index].unitCost);
        }
        return { ...prev, items };
    });

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const total = sumAmounts((form?.items || []).map(item => lineAmount(item.quantity, item.unitCost)));

    const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
            if (isUser) {
                await axios.post(`/custody/forms/ICS/${editingId}/accept`);
                toast.success('ICS receipt and accountability accepted');
                cancelEdit(); await load(); return;
            }
            await axios[editingId ? 'put' : 'post'](editingId ? `/ics/${editingId}` : '/ics', {
                ...form,
                ...(!editingId ? { autoNumber: true } : {}),
                items: form.items.filter(item => hasRowData(item, emptyItem())).map((item) => ({
                    ...item,
                    quantity: Number(item.quantity || 0),
                    unitCost: Number(item.unitCost || 0)
                }))
            });
            toast.success(editingId ? 'Inventory Custodian Slip updated' : 'Inventory Custodian Slip created');
            markUpdated(editingId);
            setSearch('');
            cancelEdit();
            load();
            scrollToRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save ICS');
        } finally { setSaving(false); }
    };

    const field = (label, key, type = 'text') => key === 'office' ? <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><OfficeSelect required aria-label={label} value={form.office} onChange={event => update('office', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label> : key === 'entityName' ? <EntityNameField value={form.entityName} onChange={value => update('entityName', value)} isNew={!editingId} /> : (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input required aria-label={label} readOnly={key === 'icsNumber' && (!editingId || linkedIssuance)} type={type} placeholder={key === 'entityName' ? 'e.g., Municipality of Carigara' : key === 'fundCluster' ? 'e.g., General Fund' : key === 'icsNumber' ? 'Assigned on save' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    );

    const signatoryFields = (label, section) => (
        <div className="ics-signatory-panel p-4">
            <h3 className="mb-5 font-semibold text-slate-700">{label}</h3>
            <div className="mx-auto grid max-w-sm gap-4">
                {section === 'receivedBy' && !editingId && <UserAccountSelect person={form[section]} onChange={person => setForm(previous => ({ ...previous, [section]: { ...previous[section], ...person, position: person.designation || person.office || '' } }))} />}
                <label className="flex flex-col text-center">
                    <SignatoryValue  aria-label={`${label} name`} value={form[section].name} onChange={event => updateSignatory(section, 'name', event.target.value)} className="w-full text-center" formType="ics" role={section} field="name" managed={(!editingId) && !form[section].user && !form[section].offlineRecipient && !(['requestedBy', 'receivedBy', 'returnedBy'].includes(section) && form[section].name)} />
                    <span className="mt-1 text-sm text-slate-600">Signature over Printed Name</span>
                </label>
                <label className="flex flex-col text-center">
                    <SignatoryValue  aria-label={`${label} position or office`} value={form[section].position} onChange={event => updateSignatory(section, 'position', event.target.value)} className="w-full text-center" formType="ics" role={section} field="position" managed={(!editingId) && !form[section].user && !form[section].offlineRecipient && !(['requestedBy', 'receivedBy', 'returnedBy'].includes(section) && form[section].name)} />
                    <span className="mt-1 text-sm text-slate-600">Position/Office</span>
                </label>
                <label className="flex flex-col text-center">
                    <input required type="date" aria-label={`${label} date`} value={form[section].date} onChange={event => updateSignatory(section, 'date', event.target.value)} className="w-full text-center" />
                    <span className="mt-1 text-sm text-slate-600">Date</span>
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
      await exportOfficialFormPdf('ICS', data, print);
    };

    useSourceDocument(records, setRecords, startEdit, '/ics');

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            {!editorOpen && <div ref={recordsRef} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}></SavedReportsHeader>
                {records.length === 0 && <p className="mt-3 text-sm text-slate-500">No Inventory Custodian Slip records yet.</p>}
                {visibleRecords.map((record) => (
                    <div key={record._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === record._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}><NewFormBadge record={record} />
                        <div>
                            <div className="mb-1 font-semibold text-slate-900">{reportItemNames(record)}</div>
                            <b>{record.icsNumber || 'Unassigned ICS No.'}</b>
                            <div className="text-sm text-slate-500">
                                {record.entityName || 'No entity'} · Total: {Number(record.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <RecordActionButton action="view" title="View Form" onClick={() => startEdit(record, true)} />
                            {/* <button type="button" onClick={() => generateDoc(record)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(record)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(record, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>}

            {editorOpen && form && (
                <ValidatedForm ref={editorRef} onSubmit={save} aria-busy={saving} inert={saving ? true : undefined} className="form-document form-frame ics-editor scroll-mt-6 p-6">
                    <FormEditorHeader title="Inventory Custodian Slip" description="Linked RIS issuances for items with a unit cost below ₱50,000 are recorded here under the requester account." onClose={cancelEdit} />
                {!editingId && !isUser && <IarSourceSelect type="ics" setForm={setForm} />}
                    <p className="mb-3 text-sm text-slate-600">{!isUser && linkedIssuance ? 'Edit form details below. Issued quantities, costs, item numbers and the ICS number are tied to the stock records.' : ''}</p>
                    <fieldset disabled={readOnly} className="min-w-0">
                    <div className="grid gap-3 md:grid-cols-3">
                        {field('Entity Name', 'entityName')}
                        <FundClusterField value={form.fundCluster} onChange={(value) => update('fundCluster', value)} />
                        {field('ICS No.', 'icsNumber')}{field('Office', 'office')}
                    </div>
                    <TableScroll preserveTable label="ICS items ? scroll horizontally to view all columns" className="ics-table-scroll mt-6">
                        <table className="ics-items-table w-full table-fixed text-sm">
                            <colgroup>{[8, 6, 10, 11, 30, 15, 16, 4].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
                            <thead>
                                <tr className="bg-slate-50 text-left">
                                    <th className="p-2">Quantity <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                    <th className="p-2">Unit <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                    <th className="p-2">Unit Cost <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                    <th className="p-2">Total Cost</th>
                                    <th className="p-2">Description <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                    <th className="p-2">Inventory Item No. <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                    <th className="p-2">Estimated Useful Life <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                  <th className="w-12 p-2"><span className="sr-only">Row actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {form.items.map((item, index) => (
                                    <tr key={index}>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} data-positive="true" min="0" step="any" readOnly={linkedIssuance} aria-label="Quantity" type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} aria-label="Unit" value={item.unit} onChange={(e) => updateItem(index, 'unit', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} readOnly={linkedIssuance} aria-label="Unit Cost" type="number" min="0" step="any" value={item.unitCost} onChange={(e) => updateItem(index, 'unitCost', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} aria-label="Total Cost" readOnly value={Number(item.totalCost || 0).toFixed(2)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} pattern=".*\S.*" title="Enter an item description" aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} readOnly={linkedIssuance} aria-label="Inventory Item No." value={item.inventoryItemNo} onChange={(e) => updateItem(index, 'inventoryItemNo', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                        <td className="p-2">
                                            <input required={hasRowData(item, emptyItem())} aria-label="Estimated Useful Life" value={item.estimatedUsefulLife} onChange={(e) => updateItem(index, 'estimatedUsefulLife', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                        </td>
                                      <td className="p-2 text-center">{!linkedIssuance && <DeleteRowButton index={index} onClick={() => setForm(previous => ({ ...previous, items: previous.items.filter((_, rowIndex) => rowIndex !== index) }))} />}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th scope="row" colSpan={2} className="text-left">TOTAL</th>
                                    <td colSpan={2} className="font-semibold text-right">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td />
                                    <td />
                                    <td />
                                    <td />
                                </tr>
                                <tr>
                                    <th scope="row" colSpan={2} className="text-left">REMARKS:</th>
                                    <td colSpan={6}><textarea aria-label="Remarks" value={form.remarks} onChange={event => update('remarks', event.target.value)} className="w-full" rows={2} /></td>
                                </tr>
                            </tfoot>
                        </table>
                    </TableScroll>
                    <div className="ics-signatories grid md:grid-cols-2">
                        {signatoryFields('Received from:', 'receivedFrom')}
                        {signatoryFields('Received by:', 'receivedBy')}
                    </div>
                    {!linkedIssuance && <div className="mt-3 flex justify-end"><AddRowButton onClick={addItem} /></div>}

                    </fieldset>
                    <p className="mt-4 text-sm text-slate-600">{selectedRecord?.acceptedAt ? `Accepted on ${new Date(selectedRecord.acceptedAt).toLocaleString()}` : linkedIssuance ? 'Awaiting custodian acceptance' : ''}</p>
                    <div className="flex justify-end">
                      <button type="submit" disabled={saving || (isUser ? !!selectedRecord?.acceptedAt : readOnly)} className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-50">{isUser ? selectedRecord?.acceptedAt ? 'Receipt Accepted' : 'Accept ICS Receipt' : 'Save'}</button>
                    </div>
                </ValidatedForm>
            )}
        </div>
    );
}
