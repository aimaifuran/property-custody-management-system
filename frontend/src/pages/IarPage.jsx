import {
    useEffect,
    useState
} from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

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
    const [form, setForm] = useState(initial);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
        setLoading(true);
        try {
            const {
                data
            } = await axios.get('/iar');
            setIar(data.data || []);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []);
    const startEdit = (item) => {
        setEditingId(item._id);
        setForm(toForm(item));
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(initial);
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
        setSaving(true);
        try {
            if (editingId) {
                await axios.put(`/iar/${editingId}`, payload);
                toast.success('IAR updated');
            } else {
                await axios.post('/iar', payload);
                toast.success('IAR saved. Property Card, RIS draft, and ICS/PAR record created.');
            }
            setEditingId(null);
            setForm(initial);
            await load();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to save IAR');
        } finally {
            setSaving(false);
        }
    };
    const field = (label, key, type = 'text') => <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input type={type} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>;

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

      form.getTextField("entityName").setText(String(data.entityName ?? ''));
      form.getTextField("fundCluster").setText(String(data.fundCluster ?? ''));
      form.getTextField("supplierName").setText(String(data.supplierName ?? ''));
      form.getTextField("poNumber").setText(String(data.poNumber ?? ''));
      form.getTextField("reqOffice").setText(String(data.requisitioningOffice ?? ''));
      form.getTextField("rcc").setText(String(data.responsibilityCenterCode ?? ''));
      form.getTextField("iarNumber").setText(String(data.iarNumber ?? ''));
      form.getTextField("iarDate").setText(String(formatDate(data.iarDate ?? '')));
      form.getTextField("invoiceNumber").setText(String(data.invoiceNumber ?? ''));
      form.getTextField("invoiceDate").setText(String(formatDate(data.invoiceDate ?? '')));

      // Table data insertion
      const startRowNumber = 1; // Starting row for table data
      data.items.forEach((item, index) => {
        form.getTextField(`stockNumber${index + 1}`).setText(String(item.stockNumber ?? ''));
        form.getTextField(`description${index + 1}`).setText(String(item.description ?? ''));
        form.getTextField(`unit${index + 1}`).setText(String(item.unit ?? ''));
        form.getTextField(`quantity${index + 1}`).setText(String(item.quantity ?? ''));
      });

      
      form.getTextField("inspectionDate").setText(String(formatDate(data.inspectionDate ?? '')));
      form.getTextField("inspectedBy").setText(String(data.inspectedBy ?? ''));
      form.getTextField("acceptanceDate").setText(String(formatDate(data.acceptanceDate ?? '')));
      form.getTextField("complete").setText(String(data.acceptanceStatus === "Complete" ? "/" : ""));
      form.getTextField("partial").setText(String(data.acceptanceStatus === "Partial" ? "/" : ""));
      form.getTextField("acceptedBy").setText(String(data.acceptedBy ?? ''));

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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Saved Reports</h2>
          {loading ? (
            <SkeletonList count={3} actions={4} />
          ) : (
            <>
              {iar.length === 0 && <p className="mt-3 text-sm text-slate-500">No IAR records yet.</p>}
              {iar.map((item) =>
                <div key={item._id} className="mt-3 rounded-xl border p-3 flex justify-between items-center">
                  <div>
                    <b>{item.iarNumber}</b>
                    <div className="text-sm text-slate-500">
                      {item.entityName || 'No entity'} · linked records created
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
              )}
            </>
          )}
        </div>
        <hr className="border-slate-300 border-2 my-8" />
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold">{editingId ? 'Update Inspection & Acceptance Report' : 'Inspection & Acceptance Report'}</h1>
              <p className="text-sm text-slate-500">{editingId ? 'Editing an existing IAR. Its linked Property Card, RIS, and ICS/PAR records are not recalculated.' : 'Saving an IAR automatically creates its linked Property Card, RIS draft, and an Inventory Custodian (below ₱50,000) or Property Acknowledgement Receipt (₱50,000 and up) record.'}</p>
            </div>
            {editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border px-3 py-2 text-sm">Cancel</button>}
          </div>
          <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              {field('Entity Name', 'entityName')}
              {field('Fund Cluster', 'fundCluster')}
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
            <button type="submit" disabled={saving} className="mt-5 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
              {saving && <Spinner size={16} />}
              {saving ? 'Saving…' : (editingId ? 'Update IAR' : 'Save IAR')}
            </button>
          </form>
        </div>
      </>
    )
}