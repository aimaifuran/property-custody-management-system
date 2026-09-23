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
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { ChevronLeft, ChevronRight, FileText, Printer, RotateCcw, Search } from 'lucide-react';
import FundClusterField from '../components/FundClusterField';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const emptyItem = () => ({
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

const newForm = () => ({ ...initial, items: [emptyItem()] });

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
        stockPropertyNumber: item.stockPropertyNumber || item.stockNumber || '',
        description: item.description || item.item || '',
        unit: item.unit || '',
        quantity: item.quantity ?? '',
        unitCost: item.unitCost ?? '',
        totalCost: item.totalCost ?? 0
    })) : [emptyItem()]
});

export default function IarPage() {
    const [iar, setIar] = useState([]);
    const [form, setForm] = useState(newForm);
    const [editingId, setEditingId] = useState(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
    const { editorRef, recordsRef, updatedId, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    const update = (key, value) => setForm((prev) => ({
        ...prev,
        [key]: value
    }));
    const updateItem = (index, key, value) => setForm((prev) => {
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
    const load = async () => {
        const {
            data
        } = await axios.get('/iar');
        setIar(data.data || []);
    };
    useEffect(() => {
        load();
        axios.get('/document-numbers/IAR')
          .then(({ data }) => setForm((previous) => previous.iarNumber ? previous : { ...previous, iarNumber: data.data.nextNumber }))
          .catch(() => {});
    }, []);
    const filteredReports = useMemo(() => {
      const keyword = search.trim().toLowerCase();
      return keyword ? iar.filter((report) => [report.iarNumber, report.entityName, report.supplierName, report.poNumber, report.invoiceNumber].some((value) => String(value || '').toLowerCase().includes(keyword))) : iar;
    }, [iar, search]);
    const totalPages = Math.max(1, Math.ceil(filteredReports.length / perPage));
    const visibleReports = filteredReports.slice((page - 1) * perPage, page * perPage);
    const updateSearch = (value) => { setSearch(value); setPage(1); };
    const updatePerPage = (value) => { setPerPage(Number(value)); setPage(1); };
    const startEdit = (item) => {
        setEditingId(item._id);
        setForm(toForm(item));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(newForm());
        axios.get('/document-numbers/IAR')
          .then(({ data }) => setForm((previous) => ({ ...previous, iarNumber: data.data.nextNumber })))
          .catch(() => {});
    };

    const save = async (event) => {
        event.preventDefault();
        const payload = {
            ...form,
            items: form.items.filter((item) => item.stockPropertyNumber || item.description).map((item) => ({
                ...item,
                quantity: Number(item.quantity || 0),
                unitCost: Number(item.unitCost || 0)
            }))
        };
        try {
            if (editingId) {
                await axios.put(`/iar/${editingId}`, payload);
                toast.success('IAR updated');
              markUpdated(editingId);
            } else {
                await axios.post('/iar', payload);
                toast.success('IAR saved. Property Card, RIS draft, and ICS/PAR record created.');
            }
            setEditingId(null);
            setForm(newForm());
            axios.get('/document-numbers/IAR')
              .then(({ data }) => setForm((previous) => ({ ...previous, iarNumber: data.data.nextNumber })))
              .catch(() => {});
            load();
            if (editingId) scrollToRecords();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save IAR');
        }
    };
    const field = (label, key, type = 'text') => <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input type={type} placeholder={key === 'entityName' ? 'e.g., Municipality of Carigara' : key === 'fundCluster' ? 'e.g., General Fund' : key === 'iarNumber' ? 'e.g., IAR-2026-001' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>;

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
      <>
        <div ref={recordsRef} className="saved-records rounded-xl border border-white bg-[#eef7f1] p-4 shadow-[7px_7px_16px_rgba(47,90,66,0.12),-7px_-7px_16px_rgba(255,255,255,0.92)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-bold tracking-tight text-[#285943]">Saved Reports</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[240px]"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search reports" className="w-full rounded-lg border border-white bg-[#eef7f1] py-2 pl-9 pr-3 text-xs text-slate-700 shadow-inner" /></label>
              <label className="flex items-center gap-2 whitespace-nowrap text-xs text-[#285943]">Per page <select value={perPage} onChange={(event) => updatePerPage(event.target.value)} className="rounded-lg border border-white bg-[#eef7f1] px-2 py-2 text-xs shadow-inner"><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label>
            </div>
          </div>
          {visibleReports.map((item) => 
            <div key={item._id} className={`saved-record mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white bg-[#eef7f1] px-3 py-3 shadow-[4px_4px_10px_rgba(47,90,66,0.10),-4px_-4px_10px_rgba(255,255,255,0.85)] transition sm:px-4 ${updatedId === item._id ? 'ring-2 ring-emerald-300 animate-pulse' : ''}`}>
              <div>
                <b className="text-sm tracking-tight text-[#285943]">{item.iarNumber}</b>
                <div className="mt-1 text-xs text-slate-500">
                  {item.entityName || 'No entity'} · linked records created
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" title="Update report" onClick={() => startEdit(item)} className="grid h-9 w-12 place-items-center rounded-lg border border-white bg-[#eef7f1] shadow-[3px_3px_7px_rgba(47,90,66,0.12),-3px_-3px_7px_rgba(255,255,255,0.85)]"><img src="/update.png" alt="" className="h-6 w-6 object-contain" /></button>
                {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                <button type="button" title="Download PDF" onClick={() => generatePdf(item)} className="grid h-9 w-12 place-items-center rounded-lg border border-white bg-[#eef7f1] shadow-[3px_3px_7px_rgba(47,90,66,0.12),-3px_-3px_7px_rgba(255,255,255,0.85)]"><img src="/pdf.png" alt="" className="h-6 w-6 object-contain" /></button>
                <button type="button" title="Print report" onClick={() => generatePdf(item, true)} className="grid h-9 w-12 place-items-center rounded-lg border border-white bg-[#eef7f1] shadow-[3px_3px_7px_rgba(47,90,66,0.12),-3px_-3px_7px_rgba(255,255,255,0.85)]"><img src="/print.png" alt="" className="h-6 w-6 object-contain" /></button>
              </div>
            </div>
          )}
        </div>
        <hr className="border-slate-300 border-2 my-8" />
        <div className="space-y-6">
          <form ref={editorRef} onSubmit={save} className="form-document form-frame scroll-mt-6 p-6">
            <div className="form-title-row mb-5">
              <div>
                <h1 className="form-page-title">{editingId ? 'Update Inspection & Acceptance Report' : 'Inspection & Acceptance Report'}</h1>
                <p className="mt-2 text-sm text-slate-500">{editingId ? 'Editing an existing IAR. Its linked Property Card, RIS, and ICS/PAR records are not recalculated.' : 'Saving an IAR automatically creates its linked Property Card, RIS draft, and an Inventory Custodian (below ₱50,000) or Property Acknowledgement Receipt (₱50,000 and up) record.'}</p>
              </div>
              {editingId && <button type="button" onClick={cancelEdit} className="form-title-action rounded-xl border px-3 py-2 text-sm">Cancel</button>}
            </div>
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
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 text-left">
                    <th className="p-2">Stock/Property No.</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Quantity</th>
                    <th className="p-2">Unit Cost</th>
                    <th className="p-2">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => 
                    <tr key={index}>
                      {['stockPropertyNumber', 'description', 'unit'].map((key) => 
                        <td className="p-2" key={key}>
                          <input aria-label={key} value={item[key]} onChange={(e) => 
                            updateItem(index, key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                        </td>
                      )}
                      <td className="p-2">
                        <input aria-label="Quantity" type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                      </td>
                      <td className="p-2">
                        <input aria-label="Unit Cost" type="number" value={item.unitCost} onChange={(e) => updateItem(index, 'unitCost', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                      </td>
                      <td className="p-2">
                        <input aria-label="Total Cost" readOnly value={item.totalCost} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-2" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
            <button type="submit" className="mt-5 rounded-xl bg-teal-600 px-4 py-2 text-white justify-end">{editingId ? 'Update IAR' : 'Save IAR'}</button>
          </form>
        </div>
      </>
    )
}
