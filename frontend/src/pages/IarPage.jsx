import ValidatedForm from '../components/ValidatedForm';
import NewFormBadge from '../components/NewFormBadge';
import ClientPagination from '../components/Pagination';
import { sortSavedReports } from '../utils/savedReportOrder';
import useSavedReportPage from '../utils/useSavedReportPage';
import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import EntityNameField from '../components/EntityNameField';
import SavedReportsHeader from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import RecordActionButton from '../components/RecordActionButton';
import {
    useEffect,
    useMemo,
    useState
} from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { ChevronLeft, ChevronRight, FileText, Printer, RotateCcw } from 'lucide-react';
import FundClusterField from '../components/FundClusterField';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';
import useDocumentNumberPreview from '../utils/useDocumentNumberPreview';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

const emptyItem = () => ({
    serialNumber: '',
    propertyNumber: '',
    stockPropertyNumber: '',
    description: '',
    unit: '',
    quantity: '',
    unitCost: '',
    totalCost: 0
});
const initial = {
    entityName: '',
    fundCluster: '',
    supplierName: '',
    poNumber: '',
    poDate: '',
    responsibilityCenterCode: '',
    iarNumber: '',
    iarDate: '',
    invoiceNumber: '',
    invoiceDate: '',
    inspectionDate: '',
    inspectedBy: '',
    acceptanceDate: '',
    acceptanceStatus: 'Complete',
    acceptanceQuantity: '',
    custodian: '',
    items: [emptyItem()]
};

const newForm = () => ({ ...initial, inspectedBy: getStickySignatory('inspectedBy').name ?? '', custodian: getStickySignatory('custodian').name ?? '', items: [emptyItem()] });

const readDraft = key => {
    try {
        const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (!draft?.form || !Array.isArray(draft.form.items) || !draft.form.items.length) return null;
        // Give an unsaved draft from the previous numbering format a current
        // preview while keeping all received items and other entered details.
        if (!draft.editingId && draft.form.iarNumber && (/[^0-9]/.test(draft.form.iarNumber) || String(draft.form.iarNumber).length > 4)) {
            return { ...draft, form: { ...draft.form, iarNumber: '' }, numberEdited: false };
        }
        return draft;
    } catch { return null; }
};

const toDateInputValue = (date) => {
    if (!date) return '';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
};

const toForm = (record) => ({
    entityName: record.entityName || '',
    fundCluster: record.fundCluster || '',
    supplierName: record.supplierName || record.supplier?.name || '',
    poNumber: record.poNumber || '',
    poDate: toDateInputValue(record.poDate || record.purchaseDate),
    responsibilityCenterCode: record.responsibilityCenterCode || '',
    iarNumber: record.iarNumber || '',
    iarDate: toDateInputValue(record.iarDate),
    invoiceNumber: record.invoiceNumber || '',
    invoiceDate: toDateInputValue(record.invoiceDate),
    inspectionDate: toDateInputValue(record.inspectionDate),
    inspectedBy: record.inspectedBy || '',
    acceptanceDate: toDateInputValue(record.acceptanceDate),
    acceptanceStatus: record.acceptanceStatus || 'Complete',
    acceptanceQuantity: record.acceptanceQuantity ?? '',
    custodian: record.custodian || record.receivedBy || record.acceptedBy || '',
    items: record.items && record.items.length ? record.items.map((item) => ({
        itemType: item.itemType || 'ASSET',
        serialNumber: item.serialNumber || '',
        propertyNumber: item.propertyNumber || '',
        stockPropertyNumber: item.stockPropertyNumber || item.stockNumber || '',
        description: item.description || item.item || '',
        unit: item.unit || '',
        quantity: item.quantity ?? '',
        unitCost: item.unitCost ?? '',
        totalCost: item.totalCost ?? 0
    })) : [emptyItem()]
});

export default function IarPage() {
    const { user } = useAuth();
    const draftKey = `pams.iar-draft.${user._id}`;
    const [restoredDraft] = useState(() => readDraft(draftKey));
    const [pageLoading, setPageLoading] = useState(true);
    const [pageLoadError, setPageLoadError] = useState('');

    const [iar, setIar] = useState([]);
    const [form, setForm] = useState(() => restoredDraft?.form || newForm());
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [numberEdited, setNumberEdited] = useState(restoredDraft?.numberEdited || false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const { refreshNumberPreview, cancelNumberPreview } = useDocumentNumberPreview('IAR', 'iarNumber', setForm);
    const [editingId, setEditingId] = useState(restoredDraft?.editingId || null);
    const [editorOpen, setEditorOpen] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
    const { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    const update = (key, value) => {
        setSaveError('');
        if (key === 'iarNumber') {
            cancelNumberPreview();
            value = value.replace(/[^0-9]/g, '').slice(0, 4);
            setNumberEdited(true);
        }
        if (['inspectedBy', 'custodian'].includes(key)) saveStickySignatory(key, { name: value }, 'name');
        setForm(prev => ({ ...prev, [key]: value }));
    };
    const updateItem = (index, key, value) => {
      setSaveError('');
      setForm((prev) => {
        const items = prev.items.map((item, i) => i === index ? {
            ...item,
            [key]: value
        } : item);
        if (key === 'quantity' || key === 'unitCost') items[index].totalCost = Number(items[index].quantity || 0) * Number(items[index].unitCost || 0);
        return {
            ...prev,
            items
        };
      });
    };
    const load = async (background = false) => {
      if (!background) { setPageLoading(true); setPageLoadError(''); }
      try {

        const {
            data
        } = await axios.get('/iar');
        setIar(data.data || []);

      } catch (error) {
        if (background) toast.error('The IAR was saved, but the record list could not refresh.');
        else setPageLoadError(error.response?.data?.message || 'Unable to load records.');
      } finally {
        if (!background) setPageLoading(false);
      }
    };
    useEffect(() => { load(); if (!restoredDraft || (!restoredDraft.editingId && !restoredDraft.form.iarNumber)) refreshNumberPreview(); }, []);
    const filteredReports = useMemo(() => {
      const keyword = search.trim().toLowerCase();
      const ordered = sortSavedReports(iar);
      return keyword ? ordered.filter((report) => [report.iarNumber, report.entityName, report.supplierName, report.poNumber, report.invoiceNumber].some((value) => String(value || '').toLowerCase().includes(keyword))) : ordered;
    }, [iar, search]);
    useSavedReportPage(filteredReports, savedUpdate, perPage, setPage);
    const totalPages = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleReports = filteredReports.slice((page - 1) * perPage, page * perPage);
    const updateSearch = (value) => { setSearch(value); setPage(1); };
    const updatePerPage = (value) => { setPerPage(Number(value)); setPage(1); };
    const startEdit = (item) => {
        cancelNumberPreview();
        setSaveError(''); setNumberEdited(false);
        setEditorOpen(true);
        setEditingId(item._id);
        setForm(toForm(item));
    };

    const cancelEdit = () => {
        try { sessionStorage.removeItem(draftKey); } catch { /* The form can still be used when storage is unavailable. */ }
        setSessionExpired(false);
        setSaveError(''); setNumberEdited(false);
        setEditingId(null);
        setForm(newForm());
        refreshNumberPreview();
    };

    const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        const payload = {
            ...form,
            iarNumber: form.iarNumber.trim(),
            ...(!editingId ? { autoNumber: !numberEdited } : {}),
            items: form.items.filter((item) => item.stockPropertyNumber || item.description).map((item) => {
                const { unitCost, ...receivedItem } = item;
                return {
                    ...receivedItem,
                    quantity: Number(item.quantity || 0),
                    ...(unitCost !== '' && unitCost != null ? { unitCost: Number(unitCost) } : {})
                };
            })
        };
        if (!payload.items.length) { setSaveError('Enter at least one received item before saving the IAR.'); return; }
        setSaveError('');
        setSaving(true);
        try {
            let savedRecord;
            if (editingId) {
                const { data } = await axios.put(`/iar/${editingId}`, payload);
                savedRecord = data.data;
                toast.success('IAR updated');
            } else {
                const { data } = await axios.post('/iar', payload);
                savedRecord = data.data;
                toast.success('IAR saved. Property Card and RIS draft created. ICS/PAR will be generated when issued.');
            }
            if (savedRecord?._id) {
                setIar(previous => [savedRecord, ...previous.filter(record => record._id !== savedRecord._id)]);
                markUpdated(savedRecord._id);
            }
            setSearch(''); setPage(1);
            cancelEdit();
            await load(true);
            scrollToRecords();
        } catch (error) {
            const expired = error.response?.status === 401;
            if (expired) {
                setSessionExpired(true);
                try { sessionStorage.setItem(draftKey, JSON.stringify({ form, editingId, numberEdited })); } catch { /* Keep the current form mounted if browser storage is unavailable. */ }
            }
            const message = expired ? 'Your session has expired. Sign in again and reopen IAR to continue with your saved entries.' : error.response?.data?.message || 'Unable to save IAR. Check the connection and try again.';
            setSaveError(message);
            toast.error(message);
        } finally { setSaving(false); }
    };
    const field = (label, key, type = 'text') => {
        if (key === 'entityName') return <EntityNameField value={form.entityName} onChange={value => update('entityName', value)} isNew={!editingId} />;
        // Already issued document numbers remain intact until explicitly changed.
        const legacyNumber = key === 'iarNumber' && editingId && !/^[0-9]{3,4}$/.test(form.iarNumber) && iar.some(record => record._id === editingId && record.iarNumber === form.iarNumber);
        const numberProps = key === 'iarNumber' ? {
            inputMode: 'numeric',
            minLength: 3,
            maxLength: 4,
            pattern: legacyNumber ? undefined : '[0-9]{3,4}',
            title: 'Enter a 3 or 4 digit IAR number',
            autoComplete: 'off'
        } : {};
        return <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input required={key !== 'acceptanceQuantity' || form.acceptanceStatus === 'Partial'} aria-label={label} type={type} {...numberProps} placeholder={key === 'iarNumber' ? '001' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>;
    };

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
      console.log('Generating Excel for IAR:', data);

      // Load the template
      const response = await fetch("/forms/templates/iar-template.xlsx");
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Select the worksheet
      const worksheet = workbook.getWorksheet("IAR");

      // Insert data into specific cells
      worksheet.getCell("B6").value = data.entityName;
      worksheet.getCell("F6").value = data.fundCluster;
      worksheet.getCell("B8").value = data.supplierName;
      worksheet.getCell("B9").value = data.poNumber;
      // worksheet.getCell("C10").value = data.requisitioningOffice;
      worksheet.getCell("C11").value = data.responsibilityCenterCode;
      worksheet.getCell("F8").value = data.iarNumber;
      worksheet.getCell("F9").value = formatDate(data.iarDate);
      worksheet.getCell("F10").value = data.invoiceNumber;
      worksheet.getCell("F11").value = formatDate(data.invoiceDate);

      // Table data insertion
      const startRow = 14; // Starting row for table data
      data.items.forEach((item, index) => {
        worksheet.getCell(`A${startRow + index}`).value = item.stockNumber;
        worksheet.getCell(`B${startRow + index}`).value = item.description;
        worksheet.getCell(`E${startRow + index}`).value = item.unit;
        worksheet.getCell(`F${startRow + index}`).value = item.quantity;
      });

      worksheet.getCell("B28").value = formatDate(data.inspectionDate);
      worksheet.getCell("A35").value = data.inspectedBy;
      worksheet.getCell("F28").value = formatDate(data.acceptanceDate);
      worksheet.getCell("D35").value = data.acceptedBy;


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
      await exportOfficialFormPdf('IAR', data, print);
    };

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={() => load()} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
      <>
        <div ref={recordsRef} className="saved-records rounded-xl border border-white bg-[#eef7f1] p-4 shadow-[7px_7px_16px_rgba(47,90,66,0.12),-7px_-7px_16px_rgba(255,255,255,0.92)] sm:p-5">
          <SavedReportsHeader search={search} onSearch={updateSearch} perPage={perPage} onPerPage={updatePerPage} options={[5, 10, 20]}><NewFormButton onNew={() => { cancelEdit(); setEditorOpen(true); }} editorRef={editorRef} /></SavedReportsHeader>
          {visibleReports.map((item) =>
            <div key={item._id} className={`saved-record mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white bg-[#eef7f1] px-3 py-3 shadow-[4px_4px_10px_rgba(47,90,66,0.10),-4px_-4px_10px_rgba(255,255,255,0.85)] transition sm:px-4 ${updatedId === item._id ? 'ring-2 ring-emerald-300 animate-pulse' : ''}`}><NewFormBadge record={item} />
              <div>
                <b className="text-sm tracking-tight text-[#285943]">{item.iarNumber}</b>
                <div className="mt-1 text-xs text-slate-500">
                  {item.entityName || 'No entity'} · linked records created
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RecordActionButton action="edit" title="Update report" onClick={() => startEdit(item)} />
                {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(item)} />
                <RecordActionButton action="print" title="Print report" onClick={() => generatePdf(item, true)} />
              </div>
            </div>
          )}
          <ClientPagination showPageSize={false} page={page} pageCount={totalPages} perPage={perPage} onPageChange={setPage} onPerPageChange={updatePerPage} />
        </div>
        <hr className="border-slate-300 border-2 my-8" />
        <div className="space-y-6">
          {editorOpen && (<ValidatedForm ref={editorRef} onSubmit={save} aria-busy={saving} inert={saving ? true : undefined} onInvalidCapture={event => setSaveError(`${event.target.getAttribute('aria-label') || 'Required field'}: ${event.target.validationMessage}`)} className="form-document form-frame scroll-mt-6 p-6">
            <FormEditorHeader title="Inspection and Acceptance Report" description={editingId ? 'Editing an existing IAR. Its linked Property Card, RIS, and ICS/PAR records are not recalculated.' : 'Saving an IAR records received stock and creates a Property Card and RIS draft. ICS/PAR are generated during issuance.'} onClose={() => { cancelEdit(); setEditorOpen(false); scrollToRecords(); }} />
            <div className="grid gap-3 md:grid-cols-3">
              {field('Entity Name', 'entityName')}
              <FundClusterField value={form.fundCluster} onChange={(value) => update('fundCluster', value)} />
              {field('Supplier', 'supplierName')}
              {field('PO/JO No.', 'poNumber')}
              {field('PO/JO Date', 'poDate', 'date')}
              {field('Responsibility Center Code', 'responsibilityCenterCode')}
              {field('IAR No.', 'iarNumber')}
              {field('IAR Date', 'iarDate', 'date')}
              {field('Invoice No.', 'invoiceNumber')}
              {field('Invoice Date', 'invoiceDate', 'date')}
            </div>
            <TableScroll className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 text-left">
                    <th className="p-2">Stock/Property No. <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                    <th className="p-2">Description <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                    <th className="p-2">Unit <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                    <th className="p-2">Quantity <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) =>
                    <tr key={index}>
                      {['stockPropertyNumber', 'description', 'unit'].map((key) =>
                        <td className="p-2" key={key}>
                          <input required aria-label={key} value={item[key]} onChange={(e) =>
                            updateItem(index, key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                        </td>
                      )}
                      <td className="p-2">
                        <input required aria-label="Quantity" type="number" min="1" step="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
            <button type="button" onClick={() => update('items', [...form.items, emptyItem()])} className="mt-3 rounded-xl border px-3 py-2">Add item</button>
            <div className="mt-6 grid gap-3 border-t pt-4 md:grid-cols-3">
              <h2 className="md:col-span-3 text-lg font-semibold">INSPECTION</h2>
              {field('Date Inspected', 'inspectionDate', 'date')}
              {field('Inspection Officer/Committee', 'inspectedBy')}
              <h2 className="md:col-span-3 mt-3 text-lg font-semibold">ACCEPTANCE</h2>
              {field('Date Received', 'acceptanceDate', 'date')}
              <label>
                <span className="mb-1 block text-sm font-semibold text-slate-700">Acceptance</span>
                <select value={form.acceptanceStatus} onChange={(e) => update('acceptanceStatus', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                  <option value="Complete">Complete</option>
                  <option value="Partial">Partial</option>
                </select>
              </label>
              {field('Partial Quantity (if applicable)', 'acceptanceQuantity', 'number')}
              {field('Supply/Property Custodian', 'custodian')}
            </div>
            {saveError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{saveError}{sessionExpired && <Link to="/login" className="ml-2 font-semibold underline">Sign in again</Link>}</p>}
            <button type="submit" disabled={saving} aria-busy={saving} className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white justify-end disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update IAR' : 'Save IAR'}</button>
          </ValidatedForm>)}
        </div>
      </>
    )
}
