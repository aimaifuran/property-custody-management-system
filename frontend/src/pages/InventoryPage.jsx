import {
    useEffect,
    useRef,
    useState
} from 'react';
import axios from 'axios';
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

const emptyItem = () => ({
    propertyNumber: '',
    description: '',
    serialNumber: '',
    date: '',
    referenceParNo: '',
    receiptQuantity: '',
    itdQuantity: '',
    itdOfficeOfficer: '',
    balanceQuantity: '',
    amount: '',
    remarks: ''
});
const initialForm = {
    month: '',
    poNumber: '',
    entityName: '',
    fundCluster: '',
    propertyPlantAndEquipment: '',
    propertyNumber: '',
    description: '',
    serialNumber: '',
    items: [emptyItem()]
};
const inputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export default function InventoryPage() {
    const { items: cards, loading, setPage, limit, setLimit, searchInput, setSearchInput, pagination, reload } = usePaginatedList('/property-cards', { limit: 5 });
    const [editingCard, setEditingCard] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [saving, setSaving] = useState(false);
    const formTitleRef = useRef(null);

    useEffect(() => {
        if (editingCard) formTitleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [editingCard]);

    const edit = (card) => {
        const items = card.items?.length ? card.items : (card.entries || []).map((entry) => ({
            ...entry,
            propertyNumber: card.propertyNumber,
            description: card.description,
            serialNumber: card.serialNumber
        }));
        setEditingCard(card);
        setForm({
            ...initialForm,
            ...card,
            items: (items.length ? items : [emptyItem()]).map((item) => ({
                ...emptyItem(),
                ...item,
                date: inputDate(item.date)
            }))
        });
    };
    const update = (key, value) => setForm((previous) => ({
        ...previous,
        [key]: value
    }));
    const updateItem = (index, key, value) => setForm((previous) => ({
        ...previous,
        items: previous.items.map((item, itemIndex) => itemIndex === index ? {
            ...item,
            [key]: value
        } : item)
    }));
    const closeEditor = () => {
        setEditingCard(null);
        setForm(initialForm);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await axios.put(`/property-cards/${editingCard._id}`, {
                ...form,
                items: form.items.map((item) => ({
                    ...item,
                    date: item.date || null,
                    receiptQuantity: item.receiptQuantity === '' ? null : Number(item.receiptQuantity),
                    itdQuantity: item.itdQuantity === '' ? null : Number(item.itdQuantity),
                    balanceQuantity: item.balanceQuantity === '' ? null : Number(item.balanceQuantity),
                    amount: item.amount === '' ? null : Number(item.amount)
                })),
            });
            toast.success('Property Card updated');
            closeEditor();
            await reload();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to update Property Card');
        } finally {
            setSaving(false);
        }
    };
    const field = (label, key, type = 'text') => <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input type={type} value={form[key] || ''} onChange={(event) => update(key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>;
    const itemLabels = ['Property No.', 'Description', 'S/N', 'Date', 'Reference PAR No.', 'Receipt Qty', 'ITD Qty', 'ITD Office/Officer', 'Balance Qty', 'Amount', 'Remarks'];
    const itemFields = [
        ['propertyNumber', 'text'],
        ['description', 'text'],
        ['serialNumber', 'text'],
        ['date', 'date'],
        ['referenceParNo', 'text'],
        ['receiptQuantity', 'number'],
        ['itdQuantity', 'number'],
        ['itdOfficeOfficer', 'text'],
        ['balanceQuantity', 'number'],
        ['amount', 'number'],
        ['remarks', 'text']
    ];

    const formatDate = (date) => {
      if (!date) return '';
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return escapeHtml(date);
      return `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear().toString().slice(-2)}`;
    };

    const formatAmount = (amount) => {
      return amount.toLocaleString('en-US', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
      });
    };

    async function generateExcel(data) {
      console.log('Generating Excel for Property Card:', data);

      // Load the template
      const response = await fetch("/forms/templates/pc-template.xlsx");
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      // Select the worksheet
      const worksheet = workbook.getWorksheet("PC");

      // Insert data into specific cells
      worksheet.getCell("C3").value = formatDate(data.month);
      worksheet.getCell("E3").value = data.poNumber;
      worksheet.getCell("D5").value = data.entityName;
      worksheet.getCell("J5").value = data.fundCluster;
      worksheet.getCell("E7").value = data.propertyPlantAndEquipment;
      worksheet.getCell("J8").value = data.propertyNumber;
      worksheet.getCell("D9").value = data.description;

      // Table data insertion
      const startRow = 12; // Starting row for table data
      data.items.forEach((item, index) => {
        worksheet.getCell(`B${startRow + index}`).value = formatDate(item.date);
        worksheet.getCell(`C${startRow + index}`).value = item.referenceParNo;
        worksheet.getCell(`D${startRow + index}`).value = item.receiptQuantity;
        worksheet.getCell(`E${startRow + index}`).value = item.itdQuantity;
        worksheet.getCell(`F${startRow + index}`).value = item.itdOfficeOfficer;
        worksheet.getCell(`H${startRow + index}`).value = item.balanceQuantity;
        worksheet.getCell(`I${startRow + index}`).value = item.amount;
        worksheet.getCell(`J${startRow + index}`).value = item.remarks;
      });

      // Generate the modified Excel file
      const buffer = await workbook.xlsx.writeBuffer();

      // Download
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      saveAs(blob, "Property Card.xlsx");
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
      const existingPdfBytes = await fetch("/forms/templates/pc-template.pdf").then(res =>
          res.arrayBuffer()
      );

      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      const form = pdfDoc.getForm();

      form.getTextField("month").setText(String(formatDate(data.month ?? '')));
      form.getTextField("poNumber").setText(String(data.poNumber ?? ''));
      form.getTextField("entityName").setText(String(data.entityName ?? ''));
      form.getTextField("fundCluster").setText(String(data.fundCluster ?? ''));
      form.getTextField("propertyPlantAndEquipment").setText(String(data.propertyPlantAndEquipment ?? ''));
      form.getTextField("description").setText(String(data.description ?? ''));
      form.getTextField("propertyNumber").setText(String(data.propertyNumber ?? ''));
      form.getTextField("serialNumber").setText(String(data.serialNumber ?? ''));

      // Table data insertion
      const startRowNumber = 1; // Starting row for table data
      data.items.forEach((item, index) => {
        form.getTextField(`date${index + 1}`).setText(String(formatDate(item.date ?? '')));
        form.getTextField(`referenceParNo${index + 1}`).setText(String(item.referenceParNo ?? ''));
        form.getTextField(`receiptQuantity${index + 1}`).setText(String(item.receiptQuantity ?? ''));
        form.getTextField(`itdQuantity${index + 1}`).setText(String(item.itdQuantity ?? ''));
        form.getTextField(`itdOfficeOfficer${index + 1}`).setText(String(item.itdOfficeOfficer ?? ''));
        form.getTextField(`balanceQuantity${index + 1}`).setText(String(item.balanceQuantity ?? ''));
        form.getTextField(`amount${index + 1}`).setText(String(formatAmount(item.amount ?? '')));
        form.getTextField(`remarks${index + 1}`).setText(String(item.remarks ?? ''));
      });

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
          "PC.pdf"
        );
      }
    };

    return (
      <>
        <div className="space-y-6">
          <div><h1 className="text-3xl font-semibold">Property Card</h1><p className="text-sm text-slate-500">One Property Card form is created for each Inspection &amp; Acceptance Report, including all received items.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Submitted Property Cards</h2>
              <div className="flex flex-wrap items-center justify-end gap-5 w-[500px]">
                <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search entity, PO no., description, S/N…" />
                <PageSizeSelect limit={limit} onChange={setLimit} />
              </div>
            </div>
            {loading ? (
              <SkeletonList count={3} actions={4} />
            ) : (
              <div className="mt-4 space-y-3">
                {cards.map((card) => (
                  <div key={card._id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{card.iar?.iarNumber || 'Property Card'}</div>
                        <div className="text-sm text-slate-500">
                          {card.entityName || 'No entity'} · PO {card.poNumber || '—'} · {card.items?.length || card.entries?.length || 0} item(s)
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => edit(card)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                        <button type="button" onClick={() => generateExcel(card)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Excel</button>
                        {/* <button type="button" onClick={() => generateDoc(card)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                        <button type="button" onClick={() => generatePdf(card)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">PDF</button>
                        <button type="button" onClick={() => generatePdf(card, true)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print</button>
                      </div>
                    </div>
                  </div>
                ))}
                {!cards.length && (
                  <p className="py-4 text-slate-500">
                    No Property Cards yet. Save an IAR to create one.
                  </p>
                )}
              </div>
            )}
            {!loading && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />}
          </div>
          {editingCard ? (
            <form onSubmit={save} className="mx-auto max-w-7xl rounded-3xl border border-slate-300 bg-white p-6 shadow-xl">
              <div className="rounded-2xl border-2 border-slate-700 p-5 text-slate-900">
                <div className="border-b border-slate-300 pb-3 text-center">
                  <h2 ref={formTitleRef} className="text-2xl font-black tracking-wide">PROPERTY CARD</h2>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {field('Month','month')}
                  {field('PO No.','poNumber')}
                  {field('Entity Name','entityName')}
                  {field('Fund Cluster','fundCluster')}
                  {field('Property, Plant and Equipment','propertyPlantAndEquipment')}
                  {field('Property Number','propertyNumber')}
                  {field('Description','description')}
                  {field('S/N','serialNumber')}
                </div>
                <div className="mt-6 overflow-x-auto">
                  <h3 className="mb-2 text-lg font-semibold">Items</h3>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        {itemLabels.map((label) => (
                          <th key={label} className="p-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={index}>
                          {itemFields.map(([key, type]) => (
                            <td className="p-1" key={key}>
                              <input
                                type={type}
                                value={item[key] ?? ''}
                                onChange={(event) => updateItem(index, key, event.target.value)}
                                className="w-full rounded-lg border border-slate-200 px-2 py-2"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => update('items', [...form.items, emptyItem()])}
                    className="rounded-xl border px-4 py-2"
                  >
                    Add Item
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="rounded-xl border px-4 py-2"
                  >
                    Close Editor
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
                  >
                    {saving && <Spinner size={16} />}
                    {saving ? 'Updating…' : 'Update Property Card'}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
        </div>
      </>
    );
}