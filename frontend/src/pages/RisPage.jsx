import { preloadFormFonts } from '../utils/formPdfFonts';
import FormEditorHeader from '../components/FormEditorHeader';
import { exportOfficialFormPdf } from '../utils/exportOfficialFormPdf';
import EntityNameField from '../components/EntityNameField';
import UserAccountSelect from '../components/UserAccountSelect';
import SavedReportsHeader, { filterReports } from '../components/SavedReportsHeader';
import NewFormButton from '../components/NewFormButton';
import Skeleton, { PageSkeleton } from '../components/Skeleton';
import TableScroll from '../components/TableScroll';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { FileText, Printer, Plus, Save, RotateCcw, Trash2, CheckCircle2, XCircle, Send, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { useAuth } from '../contexts/AuthContext';
import { getStickySignatory, saveStickySignatory } from '../utils/stickySignatories';
import Pagination from '../components/Pagination';
import useUpdateFormNavigation from '../utils/useUpdateFormNavigation';

const createRow = () => ({
  stockNumber: '',
  unit: '',
  description: '',
  quantityRequested: '',
  isAvailable: null,
  stockAvailable: '',
  quantityIssued: '',
  remarks: '',
  totalCost: null,
});

const emptySignatory = () => ({ name: '', designation: '', date: '' });

const initialForm = {
  risNumber: '',
  entityName: '',
  fundCluster: '',
  division: '',
  office: '',
  responsibilityCenterCode: '',
  purpose: '',
  requestedBy: emptySignatory(),
  approvedBy: emptySignatory(),
  issuedBy: emptySignatory(),
  receivedBy: emptySignatory(),
  date: new Date().toISOString().slice(0, 10),
  status: 'PENDING_APPROVAL',
  items: [createRow(), createRow(), createRow(), createRow(), createRow()],
};

const newForm = () => ({
  ...initialForm,
  date: new Date().toISOString().slice(0, 10),
  items: [createRow(), createRow(), createRow(), createRow(), createRow()],
  requestedBy: getStickySignatory('requestedBy', emptySignatory()),
  approvedBy: getStickySignatory('approvedBy', emptySignatory()),
  issuedBy: getStickySignatory('issuedBy', emptySignatory()),
  receivedBy: getStickySignatory('receivedBy', emptySignatory()),
});

const toDateInputValue = (date) => {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

// Legacy records may still hold a plain string; fold that into `name` so old
// data keeps displaying instead of blanking out.
const toFormSignatory = (signatory) => {
  if (signatory && typeof signatory === 'object') {
    return {
      user: signatory.user?._id || signatory.user || undefined,
      name: signatory.name || '',
      designation: signatory.designation || '',
      date: toDateInputValue(signatory.date),
    };
  }
  return { name: signatory || '', designation: '', date: '' };
};

// const createRisWorkbook = (data) => {
//   const workbook = new ExcelJS.Workbook();
//   const worksheet = workbook.addWorksheet('RIS', {
//     views: [{ showGridLines: true }],
//   });

//   const thin = { style: 'thin', color: { argb: 'FF000000' } };
//   const medium = { style: 'medium', color: { argb: 'FF000000' } };

//   worksheet.pageSetup = {
//     orientation: 'portrait',
//     paperSize: 9,
//     fitToPage: true,
//     fitToWidth: 1,
//     fitToHeight: 0,
//     margins: {
//       left: 0.3,
//       right: 0.3,
//       top: 0.5,
//       bottom: 0.5,
//       header: 0.25,
//       footer: 0.25,
//     },
//   };

//   worksheet.columns = [
//     { width: 11.11 },
//     { width: 5.78 },
//     { width: 23.89 },
//     { width: 12.89 },
//     { width: 12.67 },
//     { width: 12.89 },
//     { width: 13.22 },
//     { width: 29.33 },
//   ];

//   const rowHeights = {
//     1: 9.60,
//     2: 24.60,
//     3: 13.20,
//     4: 25.80,
//     5: 13.80,
//     6: 22.20,
//     7: 4.20,
//     8: 22.20,
//     9: 18.60,
//     10: 25.80,
//     11: 25.80,
//     12: 25.80,
//     13: 25.80,
//     14: 25.80,
//     15: 25.80,
//     16: 25.80,
//     17: 25.80,
//     18: 25.80,
//     19: 25.80,
//     20: 25.80,
//     21: 25.80,
//     22: 25.80,
//     23: 25.80,
//     24: 25.80,
//     25: 25.80,
//     26: 25.80,
//     27: 25.80,
//     28: 25.80,
//     29: 25.80,
//     30: 25.80,
//     31: 0.60,
//     32: 25.80,
//     33: 25.80,
//     34: 25.80,
//     35: 28.80,
//     36: 22.20,
//     37: 22.20,
//     38: 22.20,
//     39: 22.80,
//     40: 15.00,
//   };

//   Object.entries(rowHeights).forEach(([rowNumber, height]) => {
//     worksheet.getRow(Number(rowNumber)).height = height;
//   });

//   worksheet.mergeCells('A4:H4');
//   worksheet.mergeCells('A10:D10');
//   worksheet.mergeCells('E10:F10');
//   worksheet.mergeCells('G10:H10');
//   worksheet.mergeCells('B32:H32');
//   worksheet.mergeCells('B33:H33');
//   worksheet.mergeCells('B34:H34');
//   worksheet.mergeCells('D35:E35');
//   worksheet.mergeCells('F35:G35');
//   worksheet.mergeCells('D36:E36');
//   worksheet.mergeCells('F36:G36');
//   worksheet.mergeCells('D37:E37');
//   worksheet.mergeCells('F37:G37');
//   worksheet.mergeCells('D38:E38');
//   worksheet.mergeCells('F38:G38');
//   worksheet.mergeCells('D39:E39');
//   worksheet.mergeCells('F39:G39');
//   // Bottom/Signature
//   worksheet.mergeCells('A35:B35');
//   worksheet.mergeCells('A36:B36');
//   worksheet.mergeCells('A37:B37');
//   worksheet.mergeCells('A38:B38');
//   worksheet.mergeCells('A39:B39');

//   const title = worksheet.getCell('A4');
//   title.value = 'REQUISITION AND ISSUE SLIP';
//   title.font = { name: 'Times New Roman', size: 16, bold: true };
//   title.alignment = { horizontal: 'center', vertical: 'middle' };

//   const appendix = worksheet.getCell('H2');
//   appendix.value = 'Appendix 63';
//   appendix.font = { name: 'Times New Roman', size: 12, italic: true };
//   appendix.alignment = { horizontal: 'right', vertical: 'middle' };

//   const labelFont = { name: 'Times New Roman', size: 11, bold: true };
//   const fieldFont = { name: 'Times New Roman', size: 11 };
//   const sectionFont = { name: 'Times New Roman', size: 12, bold: true, italic: true };

//   const setLabel = (address, value) => {
//     const cell = worksheet.getCell(address);
//     cell.value = value;
//     cell.font = labelFont;
//     cell.alignment = { horizontal: 'left', vertical: 'middle' };
//   };

//   const setField = (address, value) => {
//     const cell = worksheet.getCell(address);
//     cell.value = value ?? '';
//     cell.font = fieldFont;
//     cell.alignment = { horizontal: 'left', vertical: 'middle' };
//     cell.underline = true;
//   };

//   const setBorder = (address, border = thin) => {
//     const cell = worksheet.getCell(address);
//     cell.border = {
//       top: border,
//       left: border,
//       bottom: border,
//       right: border,
//     };
//   };

//   const columnToNumber = (column) => column.split('').reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0);
//   const numberToColumn = (number) => {
//     let n = number;
//     let column = '';

//     while (n > 0) {
//       const remainder = (n - 1) % 26;
//       column = String.fromCharCode(65 + remainder) + column;
//       n = Math.floor((n - 1) / 26);
//     }

//     return column;
//   };
//   const applyOuterBorder = (range, border = thin) => {
//     const [start, end] = range.split(':');
//     const startCol = start.match(/[A-Z]+/)[0];
//     const startRow = Number(start.match(/\d+/)[0]);
//     const endCol = end.match(/[A-Z]+/)[0];
//     const endRow = Number(end.match(/\d+/)[0]);
//     const startColNum = columnToNumber(startCol);
//     const endColNum = columnToNumber(endCol);

//     for (let row = startRow; row <= endRow; row += 1) {
//       for (let colNum = startColNum; colNum <= endColNum; colNum += 1) {
//         const cell = worksheet.getCell(`${numberToColumn(colNum)}${row}`);
//         cell.border = {
//           top: row === startRow ? border : cell.border?.top,
//           bottom: row === endRow ? border : cell.border?.bottom,
//           left: colNum === startColNum ? border : cell.border?.left,
//           right: colNum === endColNum ? border : cell.border?.right,
//         };
//       }
//     }
//   };

//   setLabel('A6', 'Entity Name:');
//   setField('C6', data.entityName);
//   setLabel('G6', 'Fund Cluster:');
//   setField('H6', data.fundCluster);

//   setLabel('A8', 'Division:');
//   setField('B8', data.division);
//   setLabel('F8', 'Responsibility Center Code:');
//   setField('H8', data.responsibilityCenterCode);

//   setLabel('A9', 'Office:');
//   setField('B9', data.office);
//   setLabel('F9', 'RIS No.:');
//   setField('G9', data.risNumber);

//   applyOuterBorder('A8:E9', thin);
//   applyOuterBorder('F8:H9', thin);
//   applyOuterBorder('A8:H39', thin);

//   const requisition = worksheet.getCell('A10');
//   requisition.value = 'Requisition';
//   requisition.font = sectionFont;
//   requisition.alignment = { horizontal: 'center', vertical: 'middle' };

//   const stockAvailable = worksheet.getCell('E10');
//   stockAvailable.value = 'Stock Available?';
//   stockAvailable.font = sectionFont;
//   stockAvailable.alignment = { horizontal: 'center', vertical: 'middle' };

//   const issue = worksheet.getCell('G10');
//   issue.value = 'Issue';
//   issue.font = sectionFont;
//   issue.alignment = { horizontal: 'center', vertical: 'middle' };

//   [
//     ['A11', 'Stock No.'],
//     ['B11', 'Unit'],
//     ['C11', 'Description'],
//     ['D11', 'Quantity'],
//     ['E11', 'Yes'],
//     ['F11', 'No'],
//     ['G11', 'Quantity'],
//     ['H11', 'Remarks'],
//   ].forEach(([address, value]) => {
//     const cell = worksheet.getCell(address);
//     cell.value = value;
//     cell.font = labelFont;
//     cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
//     setBorder(`${address}`, thin)
//   });

//   for (let row = 12; row <= 30; row += 1) {
//     ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((column) => {
//       const cell = worksheet.getCell(`${column}${row}`);
//       cell.value = '';
//       cell.font = fieldFont;
//       cell.alignment = {
//         horizontal: column === 'A' ? 'left' : 'center',
//         vertical: 'middle',
//         wrapText: true,
//       };
//       setBorder(`${column}${row}`, thin);
//     });
//   }

//   ['A32', 'B32', 'A40'].forEach((address) => {
//     setField(address, '');
//   });
//   setLabel('A32', 'Purpose:');
//   setField('B32', data.purpose || '');
//   worksheet.getCell('A40').value = 'AO 6/15/02';
//   worksheet.getCell('A40').font = { name: 'Times New Roman', size: 10 };


//   // Add outer borders for the main blocks.
//   ['A10', 'E10', 'G10', 'A35', 'C35', 'D35', 'F35', 'H35'].forEach((address) => {
//     if (worksheet.getCell(address).value !== undefined) {
//       worksheet.getCell(address).border = {
//         top: thin,
//         left: thin,
//         right: thin,
//       };
//     }
//   });


//   const signatureLabels = [
//     ['C35', 'Requested by:'],
//     ['D35', 'Approved by:'],
//     ['F35', 'Issued by:'],
//     ['H35', 'Received by:'],
//   ];
//   signatureLabels.forEach(([address, value]) => setLabel(address, value));

//   const signatureFieldRowTitle= [
//     ['A36', 'Signature:'],
//     ['A37', 'Printed Name:'],
//     ['A38', 'Designation:'],
//     ['A39', 'Date:'],
//   ];
//   signatureFieldRowTitle.forEach(([address, value]) => {
//     const cell = worksheet.getCell(address);
//     cell.value = value;
//     cell.font = { name: 'Times New Roman'};
//   });

//   // Add bottom borders for the signature fields.
//   const signatureFieldRanges = [
//     'A36', 'C36', 'D36', 'F36', 'H36',
//     'A37', 'C37', 'D37', 'F37', 'H37',
//     'A38', 'C38', 'D38', 'F38', 'H38',
//     'A39', 'C39', 'D39', 'F39', 'H39',
//   ];
//   signatureFieldRanges.forEach((address) => {
//     const cell = worksheet.getCell(address);
//     cell.border = {
//         left: thin,
//         right: thin,
//         bottom: thin,
//       };
//     cell.font = { name: 'Times New Roman'};
//   });

//   const items = data.items || [];
//   items.slice(0, 19).forEach((item, index) => {
//     const row = 12 + index;
//     worksheet.getCell(`A${row}`).value = item.stockNumber || '';
//     worksheet.getCell(`B${row}`).value = item.unit || '';
//     worksheet.getCell(`C${row}`).value = item.description || '';
//     worksheet.getCell(`D${row}`).value = item.quantityRequested ?? '';
//     worksheet.getCell(`E${row}`).value = item.isAvailable === true ? '/' : '';
//     worksheet.getCell(`F${row}`).value = item.isAvailable === false ? '/' : '';
//     worksheet.getCell(`G${row}`).value = item.quantityIssued ?? '';
//     worksheet.getCell(`H${row}`).value = item.remarks || '';
//   });

//   return workbook;
// };

export default function RisPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [pageLoadError, setPageLoadError] = useState('');

  useEffect(() => { preloadFormFonts(['regular', 'bold']).catch(() => {}); }, []);
  const [exportingRis, setExportingRis] = useState('');
  const [ris, setRis] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(newForm);
  const [savingRis, setSavingRis] = useState(false);
  const [fundClusterOption, setFundClusterOption] = useState('');
  const [editingRis, setEditingRis] = useState(null);
  const [creatingRis, setCreatingRis] = useState(false);
  const [issueErrors, setIssueErrors] = useState({});
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [stockLoadError, setStockLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const [approvedPage, setApprovedPage] = useState(1);
  const [approvedPerPage, setApprovedPerPage] = useState(5);
  const [approvedSearch, setApprovedSearch] = useState('');
  const isApprovedRecord = record => ['APPROVED', 'ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(record.status);
  const filteredReports = filterReports(ris.filter(record => !isApprovedRecord(record)), search);
  const approvedReports = filterReports(ris.filter(isApprovedRecord), approvedSearch);
  const { editorRef, recordsRef, updatedId, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingRis?._id);
  const supplyReviewRef = useRef(null);
  const { user } = useAuth();
  const isSupplyOfficeUser = (user?.office || '').toLowerCase().includes('supply');
  const canReviewRis = user?.role === 'admin' || isSupplyOfficeUser || user?.permissions?.includes('canReviewRIS');
  const canManage = canReviewRis;
  const canEditReview = canReviewRis;

  const load = async () => {
    setPageLoading(true);
    setPageLoadError('');
    try {

    setStockLoadError('');

    const [risResult, itemsResult] = await Promise.allSettled([axios.get('/ris'), axios.get('/items')]);

    if (risResult.status === 'fulfilled') {
      setRis(risResult.value.data.data || []);
    } else {
      setRis([]);
    }

    if (itemsResult.status === 'fulfilled') {
      setItems(itemsResult.value.data.data || []);
    } else {
      setItems([]);
      setStockLoadError('Unable to load stock list. Please refresh the page or check your account permissions.');
    }

    } catch (error) {
      setPageLoadError(error.response?.data?.message || 'Unable to load records.');
    } finally {
      setPageLoading(false);
    }
  };

  const assignNextNumber = async () => {
    try {
      const { data } = await axios.get('/document-numbers/RIS');
      setForm((previous) => previous.risNumber ? previous : { ...previous, risNumber: data.data.nextNumber });
    } catch {
      // A number can still be entered manually if the server is unavailable.
    }
  };

  useEffect(() => {
    load();
    assignNextNumber();
  }, []);
  const pageCount = Math.max(1, Math.ceil(filteredReports.length / perPage));
  const visibleRis = filteredReports.slice((page - 1) * perPage, page * perPage);
  const approvedPageCount = Math.max(1, Math.ceil(approvedReports.length / approvedPerPage));
  const visibleApproved = approvedReports.slice((approvedPage - 1) * approvedPerPage, approvedPage * approvedPerPage);
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  useEffect(() => { setApprovedPage(current => Math.min(current, approvedPageCount)); }, [approvedPageCount]);

  useEffect(() => {
    if (!reviewTarget || !reviewDraft || !supplyReviewRef.current) return;
    supplyReviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    supplyReviewRef.current.focus({ preventScroll: true });
  }, [reviewTarget, reviewDraft]);

  const completedRows = useMemo(
    () => form.items.filter((item) => item.stockNumber || item.unit || item.description),
    [form.items],
  );

  const selectedInventoryMap = useMemo(
    () => new Map(items.map((entry) => [entry.stockNumber, entry])),
    [items],
  );

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const updateSignatory = (section, key, value) => setForm((prev) => {
    const signatory = { ...prev[section], [key]: value, ...(key === 'name' ? { user: undefined } : {}) };
    saveStickySignatory(section, signatory, key);
    return { ...prev, [section]: signatory };
  });

  const updateItem = (index, key, value) => {
    setForm((prev) => {
      const nextItems = prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, [key]: value };
      });
      return { ...prev, items: nextItems };
    });
  };

  const addRow = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, createRow()] }));
  };

  const deleteRow = (index) => {
    setForm((prev) => {
      const items = prev.items.filter((_, itemIndex) => itemIndex !== index);
      return { ...prev, items: items.length ? items : [createRow()] };
    });
  };

  const resetForm = () => {
    setForm(newForm());
    setFundClusterOption('');
    setEditingRis(null);
    setCreatingRis(false);
    assignNextNumber();
  };

  const save = async (e) => {
    e.preventDefault();
    if (savingRis) return;
    const approveAfterSave = e.nativeEvent.submitter?.value === 'approve';

    const { _id, createdAt, updatedAt, __v, ...formData } = form;
    const payload = {
      ...formData,
      items: form.items
        .filter((item) => item.stockNumber || item.unit || item.description || item.quantityRequested || item.quantityIssued || item.remarks)
        .map((item) => ({
          ...item,
          quantityRequested: item.quantityRequested === '' ? 0 : Number(item.quantityRequested),
          stockAvailable: item.stockAvailable === '' ? 0 : Number(item.stockAvailable),
          quantityIssued: item.quantityIssued === '' ? 0 : Number(item.quantityIssued),
          isAvailable: item.isAvailable === null ? false : item.isAvailable,
        })),
    };

    setSavingRis(true);
    try {
      if (editingRis) {
        await axios.put(`/ris/${editingRis._id}`, payload);
        if (approveAfterSave) await axios.post(`/ris/${editingRis._id}/approve`);
        toast.success(approveAfterSave ? 'RIS approved and issued. The user can now return the items.' : 'RIS updated');
        markUpdated(editingRis._id);
      } else if (creatingRis) {
        await axios.post('/ris', payload);
        toast.success('Request form added');
      } else return;
      await load();
      resetForm();
      scrollToRecords();
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to save RIS';
      toast.error(message);
    } finally { setSavingRis(false); }
  };

  const buildReviewDraft = (record) => {
    const draftItems = (record.items || []).map((entry) => {
      const inventory = selectedInventoryMap.get(entry.stockNumber);
      const requested = Number(entry.quantityRequested || 0);
      const available = Number(inventory?.quantityOnHand || entry.stockAvailable || 0);
      const issued = Math.min(requested, available);
      const isAvailable = available > 0;
      const remarks = available <= 0
        ? 'Out of Stock - For Procurement'
        : issued < requested
          ? `[System: Deficit of ${requested - issued} units - Split workflow initiated]`
          : 'Fully Issued';

      return {
        ...entry,
        unit: entry.unit || inventory?.unit || '',
        description: entry.description || inventory?.description || '',
        quantityRequested: requested,
        stockAvailable: available,
        isAvailable,
        quantityIssued: issued,
        remarks: entry.remarks || remarks,
      };
    });

    return {
      _id: record._id,
      risNumber: record.risNumber,
      entityName: record.entityName,
      items: draftItems,
    };
  };

  const openReview = (record) => {
    if (!canEditReview) return;
    const draft = buildReviewDraft(record);
    setReviewTarget(record);
    setReviewDraft(draft);
  };

  const updateReviewItem = (index, key, value) => {
    if (!canEditReview) return;
    setReviewDraft((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((entry, itemIndex) => (
        itemIndex === index ? { ...entry, [key]: value } : entry
      ));
      return { ...prev, items };
    });
  };

  const saveReview = async () => {
    if (!canEditReview || !reviewTarget || !reviewDraft) return;
    try {
      await axios.post(`/ris/${reviewTarget._id}/review`, { items: reviewDraft.items });
      toast.success('RIS reviewed');
      setReviewTarget(null);
      setReviewDraft(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to save review');
    }
  };

  const approveRis = async (id) => {
    try {
      await axios.post(`/ris/${id}/approve`);
      toast.success('RIS approved and issued. Items are now available for return.');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to approve RIS');
    }
  };

  const rejectRis = async (id) => {
    const rejectionReason = window.prompt('Enter rejection reason');
    if (!rejectionReason?.trim()) return;

    try {
      await axios.post(`/ris/${id}/reject`, { rejectionReason: rejectionReason.trim() });
      toast.success('RIS rejected');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to reject RIS');
    }
  };

  const issueRis = async (id) => {
    try {
      setIssueErrors((prev) => ({ ...prev, [id]: '' }));
      await axios.post(`/ris/${id}/issue`);
      toast.success('RIS issued and accountability locked');
      load();
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to issue RIS';
      setIssueErrors((prev) => ({ ...prev, [id]: message }));
    }
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
  }

  async function generateExcel(data) {
    console.log('Generating Excel for RIS:', data);

    // Load the template
    const response = await fetch("/forms/templates/ris-template.xlsx");
    const arrayBuffer = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    // Select the worksheet
    const worksheet = workbook.getWorksheet("RIS");

    // Insert data into specific cells
    worksheet.getCell("C6").value = data.entityName;
    worksheet.getCell("H6").value = data.fundCluster;
    worksheet.getCell("C8").value = data.division;
    worksheet.getCell("C9").value = data.office;
    worksheet.getCell("H8").value = data.responsibilityCenterCode;
    worksheet.getCell("G9").value = data.risNumber;

    // Table data insertion
    const startRow = 12; // Starting row for table data
    data.items.forEach((item, index) => {
      worksheet.getCell(`A${startRow + index}`).value = item.stockNumber;
      worksheet.getCell(`B${startRow + index}`).value = item.unit;
      worksheet.getCell(`C${startRow + index}`).value = item.description;
      worksheet.getCell(`D${startRow + index}`).value = item.quantityRequested;
      worksheet.getCell(`E${startRow + index}`).value = item.isAvailable === true ? '/' : '';
      worksheet.getCell(`F${startRow + index}`).value = item.isAvailable === false ? '/' : '';
      worksheet.getCell(`G${startRow + index}`).value = item.quantityIssued;
      worksheet.getCell(`H${startRow + index}`).value = item.remarks;
    });

    // Requested by:
    worksheet.getCell("C36").value = null;
    worksheet.getCell("C37").value = data.requestedBy?.name;
    worksheet.getCell("C38").value = data.requestedBy?.designation;
    worksheet.getCell("C39").value = formatDate(data.requestedBy?.date);
    // Approved by:
    worksheet.getCell("D36").value = null;
    worksheet.getCell("D37").value = data.approvedBy?.name;
    worksheet.getCell("D38").value = data.approvedBy?.designation;
    worksheet.getCell("D39").value = formatDate(data.approvedBy?.date);
    // Issued by:
    worksheet.getCell("F36").value = null;
    worksheet.getCell("F37").value = data.issuedBy?.name;
    worksheet.getCell("F38").value = data.issuedBy?.designation;
    worksheet.getCell("F39").value = formatDate(data.issuedBy?.date);
    // Received by:
    worksheet.getCell("H36").value = null;
    worksheet.getCell("H37").value = data.receivedBy?.name;
    worksheet.getCell("H38").value = data.receivedBy?.designation;
    worksheet.getCell("H39").value = formatDate(data.receivedBy?.date);


    // Generate the modified Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    // Download
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, "RIS.xlsx");
  }

  async function generatePdf(data, print = false) {
      if (exportingRis) return;
      setExportingRis(data._id || data.risNumber);
      try { await exportOfficialFormPdf('RIS', data, print); }
      finally { setExportingRis(''); }
    };

  const editDraft = async (record) => {
    setFundClusterOption(record.fundCluster === 'Trust Fund' ? 'Trust Fund' : record.fundCluster ? 'Specify' : '');
    setCreatingRis(false);
    setEditingRis(record);
    setForm({
      ...initialForm,
      ...record,
      date: toDateInputValue(record.date),
      requestedBy: toFormSignatory(record.requestedBy),
      approvedBy: toFormSignatory(record.approvedBy),
      issuedBy: toFormSignatory(record.issuedBy),
      receivedBy: toFormSignatory(record.receivedBy),
      items: (record.items || []).map((item) => ({
        ...createRow(),
        ...item,
        quantityRequested: item.quantityRequested ?? '',
        stockAvailable: item.stockAvailable ?? '',
        quantityIssued: item.quantityIssued ?? '',
      })),
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const statusClasses = {
    PENDING_REVIEW: 'bg-amber-100 text-amber-700',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
    REVIEWED: 'bg-cyan-100 text-cyan-700',
    APPROVED: 'bg-sky-100 text-sky-700',
    REJECTED: 'bg-rose-100 text-rose-700',
    ISSUED: 'bg-emerald-100 text-emerald-700',
    ACCOUNTABILITY_LOCKED: 'bg-teal-100 text-teal-700',
    DRAFT: 'bg-slate-100 text-slate-700',
  };

  if (pageLoading) return <PageSkeleton />;
  if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
    <div className="space-y-6">
      {[{ key: 'drafts', title: 'Drafts & Pending Items', records: visibleRis, page, pageCount, perPage, search, setPage, setPerPage, setSearch },
        { key: 'approved', title: 'Approved Items', records: visibleApproved, page: approvedPage, pageCount: approvedPageCount, perPage: approvedPerPage, search: approvedSearch, setPage: setApprovedPage, setPerPage: setApprovedPerPage, setSearch: setApprovedSearch }].map(group => (
      <section key={group.key} aria-label={group.title} ref={group.key === 'drafts' ? recordsRef : undefined} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SavedReportsHeader title={group.title} search={group.search} onSearch={value => { group.setSearch(value); group.setPage(1); }} perPage={group.perPage} onPerPage={value => { group.setPerPage(value); group.setPage(1); }}>{group.key === 'drafts' && <NewFormButton onNew={() => { resetForm(); setCreatingRis(true); }} editorRef={editorRef} />}</SavedReportsHeader>
        {group.key === 'drafts' && stockLoadError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {stockLoadError}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {!group.records.length && <p className="text-slate-500">{group.key === 'approved' ? 'No approved items found.' : 'No draft or pending items found.'}</p>}
          {group.records.map((item) => (
            <div key={item._id} className={`saved-record rounded-xl border p-4 ${updatedId === item._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{item.risNumber}</div>
                  <div className="text-sm text-slate-500">{item.entityName}</div>
                  <div className="text-sm text-slate-500">{item.purpose}</div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[item.status] || 'bg-slate-100 text-slate-700'}`}>
                  {item.status}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                <div className="min-w-0 space-y-1 break-words">
                <div>Requested by: {item.requestedBy?.name || 'N/A'}</div>
                <div>Approved by: {item.approvedBy?.name || 'Pending'}</div>
                </div>
                <div className="min-w-0 space-y-1 break-words">
                <div>Issued by: {item.issuedBy?.name || 'Pending'}</div>
                <div>Received by: {item.receivedBy?.name || 'N/A'}</div>
                </div>
                {item.rejectionReason ? <div className="break-words text-rose-600 sm:col-span-2">Rejection reason: {item.rejectionReason}</div> : null}
              </div>
              {canManage ? (
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                {!['ISSUED', 'ACCOUNTABILITY_LOCKED'].includes(item.status) && <RecordActionButton action="edit" title="Update record" onClick={() => editDraft(item)} />}
                <RecordActionButton action="pdf" busy={exportingRis === item._id} disabled={Boolean(exportingRis)}
                  onClick={() => generatePdf(item)}
                  title="Download PDF"
                 />
                <RecordActionButton action="print" busy={exportingRis === item._id} disabled={Boolean(exportingRis)}
                  onClick={() => generatePdf(item, true)}
                  title="Print record"
                 />
                {item.status === 'PENDING_REVIEW' || item.status === 'PENDING_APPROVAL' ? (
                  <button
                    type="button"
                    onClick={() => openReview(item)}
                      className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                    >
                      <CheckCircle2 size={16} />
                      Review & Fulfill
                    </button>
                  ) : null}
                  {item.status === 'REVIEWED' ? (
                    <button
                      type="button"
                      onClick={() => issueRis(item._id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      <Send size={16} />
                      Issue RIS
                    </button>
                  ) : null}
                  {item.status === 'ACCOUNTABILITY_LOCKED' ? (
                    <div className="inline-flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700">
                      <ShieldCheck size={16} />
                      Accountable
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
              {issueErrors[item._id] ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {issueErrors[item._id]}
                </div>
              ) : null}
            </div>
          ))}
          <Pagination showPageSize={false} page={group.page} pageCount={group.pageCount} perPage={group.perPage} onPageChange={group.setPage} onPerPageChange={(value) => { group.setPerPage(value); group.setPage(1); }} />
        </div>
      </section>
      ))}

      {reviewTarget && reviewDraft ? (
        <div
          ref={supplyReviewRef}
          tabIndex={-1}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Supply Review & Fulfillment</h2>
              <p className="text-sm text-slate-500">Fill the right side for {reviewDraft.risNumber} before issuing.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewTarget(null);
                  setReviewDraft(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              {canEditReview ? (
                <>
                  <button
                    type="button"
                    onClick={saveReview}
                    className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                  >
                    Save Review
                  </button>
                  <button
                    type="button"
                    onClick={() => issueRis(reviewTarget._id)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Issue RIS
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
                  View only
                </div>
              )}
            </div>
          </div>

          <TableScroll className="mt-4 overflow-x-auto border border-slate-700">
            <div className="ris-table-grid border-b border-slate-700 bg-slate-100 text-center text-sm font-semibold">
              <div className="col-span-4 border-r border-slate-700 py-2 italic justify-center">Requisition</div>
              <div className="col-span-4 py-2 italic justify-center">Stock Available?</div>
            </div>
            <div className="ris-table-grid border-b border-slate-700 text-center text-sm font-semibold">
              <div className="border-r border-slate-700 px-2 py-2">Stock No.</div>
              <div className="border-r border-slate-700 px-2 py-2">Unit</div>
              <div className="border-r border-slate-700 px-2 py-2">Description</div>
              <div className="border-r border-slate-700 px-2 py-2">Qty Req.</div>
              <div className="border-r border-slate-700 px-2 py-2">Yes</div>
              <div className="border-r border-slate-700 px-2 py-2">No</div>
              <div className="border-r border-slate-700 px-2 py-2">Actual Qty</div>
              <div className="px-2 py-2">Remarks</div>
            </div>

            {reviewDraft.items.map((item, index) => (
              <div key={`${reviewDraft._id}-review-${index}`} className="ris-table-grid border-b border-slate-300 last:border-b-0">
                <div className="border-r border-slate-300 p-2 text-sm">{item.stockNumber}</div>
                <div className="border-r border-slate-300 p-2 text-sm">{item.unit}</div>
                <div className="border-r border-slate-300 p-2 text-sm">{item.description}</div>
                <div className="border-r border-slate-300 p-2 text-sm">{item.quantityRequested}</div>
                <div className="border-r border-slate-300 p-1 text-center">
                  <input
                    type="radio"
                    name={`review-yes-${index}`}
                    checked={item.isAvailable === true}
                    onChange={() => updateReviewItem(index, 'isAvailable', true)}
                    disabled={!canEditReview}
                    className="h-4 w-4"
                  />
                </div>
                <div className="border-r border-slate-300 p-1 text-center">
                  <input
                    type="radio"
                    name={`review-no-${index}`}
                    checked={item.isAvailable === false}
                    onChange={() => updateReviewItem(index, 'isAvailable', false)}
                    disabled={!canEditReview}
                    className="h-4 w-4"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    type="number"
                    min="0"
                    value={item.quantityIssued}
                    onChange={(e) => updateReviewItem(index, 'quantityIssued', Number(e.target.value))}
                    readOnly={!canEditReview}
                    tabIndex={canEditReview ? 0 : -1}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="p-1">
                  <input
                    value={item.remarks}
                    onChange={(e) => updateReviewItem(index, 'remarks', e.target.value)}
                    readOnly={!canEditReview}
                    tabIndex={canEditReview ? 0 : -1}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
              </div>
            ))}
          </TableScroll>
        </div>
      ) : null}

      {editingRis || creatingRis ? (<>
      <motion.form
        ref={editorRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={save}
        className="form-document form-frame scroll-mt-6 mx-auto max-w-6xl p-4"
      >
        <div className="min-w-0 text-slate-900">
          <FormEditorHeader title="Requisition and Issue Slip" description="Record requested items and issued quantities." onClose={resetForm} />

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
            <EntityNameField value={form.entityName} onChange={entityName => updateForm({ entityName })} isNew={!editingRis} />
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <label className="block font-semibold"><span className="mb-1 block">Fund Cluster:</span>
                <select aria-label="Fund Cluster" required value={fundClusterOption} onChange={event => { setFundClusterOption(event.target.value); updateForm({ fundCluster: event.target.value === 'Trust Fund' ? 'Trust Fund' : '' }); }} className="w-full rounded-lg border px-2 py-2">
                  <option value="">Select fund source</option><option value="Trust Fund">Trust Fund</option><option value="Specify">Specify</option>
                </select>
              </label>
              {fundClusterOption === 'Specify' && <label className="block"><span className="mb-1 block">Specific fund source:</span><input type="text" aria-label="Specific fund source" required value={form.fundCluster} onChange={event => updateForm({ fundCluster: event.target.value })} placeholder="e.g., General Fund" className="w-full rounded-lg border px-2 py-2" /></label>}
            </div>
          </div>

          <div className="ris-header-fields mt-4 grid gap-3 sm:grid-cols-2">
            {[['division', 'Division'], ['responsibilityCenterCode', 'Responsibility Center Code'], ['office', 'Office'], ['risNumber', 'RIS No.']].map(([key, label]) => <label key={key} className="block min-w-0"><span className="mb-1 block font-semibold">{label}:</span><input type="text" aria-label={label} value={form[key]} onChange={event => updateForm({ [key]: event.target.value })} className="w-full rounded-lg border px-2 py-2" /></label>)}
          </div>

          <TableScroll className="mt-4 overflow-x-auto border border-slate-700">
            <div className="ris-table-grid ris-table-grid--editable border-b border-slate-700 bg-slate-100 text-center text-sm font-semibold">
              <div className="col-span-4 border-r border-slate-700 py-2 italic justify-center">Requisition</div>
              <div className="col-span-4 border-r border-slate-700 py-2 italic justify-center">Stock Available?</div>
              <div className="py-2" />
            </div>
            <div className="ris-table-grid ris-table-grid--editable border-b border-slate-700 text-center text-sm font-semibold">
              <div className="border-r border-slate-700 px-2 py-2">Stock No.</div>
              <div className="border-r border-slate-700 px-2 py-2">Unit</div>
              <div className="border-r border-slate-700 px-2 py-2">Description</div>
              <div className="border-r border-slate-700 px-2 py-2">Qty Req.</div>
              <div className="border-r border-slate-700 px-2 py-2">Yes</div>
              <div className="border-r border-slate-700 px-2 py-2">No</div>
              <div className="border-r border-slate-700 px-2 py-2">Actual Qty</div>
              <div className="border-r border-slate-700 px-2 py-2">Remarks</div>
              <div className="px-2 py-2" />
            </div>

            {form.items.map((item, index) => (
              <div key={`ris-row-${index}`} className="ris-table-grid ris-table-grid--editable border-b border-slate-300 last:border-b-0">
                <div className="border-r border-slate-300 p-1">
                  <input
                    type="text"
                    aria-label={`Stock Number, row ${index + 1}`}
                    value={item.stockNumber ?? ''}
                    onChange={(e) => updateItem(index, 'stockNumber', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    value={item.unit}
                    onChange={(e) => updateItem(index, 'unit', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    type="number"
                    min="0"
                    value={item.quantityRequested}
                    onChange={(e) => updateItem(index, 'quantityRequested', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="border-r border-slate-300 p-1 flex items-center justify-center">
                  <input
                    type="radio"
                    name={`ris-yes-${index}`}
                    checked={item.isAvailable === true}
                    onChange={() => updateItem(index, 'isAvailable', true)}
                    className="h-4 w-4"
                  />
                </div>
                <div className="border-r border-slate-300 p-1 flex items-center justify-center">
                  <input
                    type="radio"
                    name={`ris-no-${index}`}
                    checked={item.isAvailable === false}
                    onChange={() => updateItem(index, 'isAvailable', false)}
                    className="h-4 w-4"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    type="number"
                    min="0"
                    value={item.quantityIssued}
                    onChange={(e) => updateItem(index, 'quantityIssued', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="border-r border-slate-300 p-1">
                  <input
                    value={item.remarks}
                    onChange={(e) => updateItem(index, 'remarks', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  />
                </div>
                <div className="flex items-center justify-center p-1">
                  <button
                    type="button"
                    onClick={() => deleteRow(index)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Delete row ${index + 1}`}
                    title="Delete row"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </TableScroll>

          <div className="mt-4 grid gap-4 border border-slate-700 p-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Purpose</span>
              <input
                value={form.purpose}
                onChange={(e) => updateForm({ purpose: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
                placeholder="Purpose of requisition"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateForm({ date: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              ['Requested by', 'requestedBy'],
              ['Approved by', 'approvedBy'],
              ['Issued by', 'issuedBy'],
              ['Received by', 'receivedBy'],
            ].map(([label, section]) => (
              <div key={section} className="rounded-xl border border-slate-700 p-4">
                <h3 className="mb-3 text-sm font-semibold">{label}</h3>
                {user?.role === 'admin' && ['requestedBy', 'receivedBy'].includes(section) && <UserAccountSelect person={form[section]} onChange={person => setForm(prev => ({ ...prev, [section]: person, ...(section === 'requestedBy' ? { office: person.designation || prev.office, receivedBy: { ...prev.receivedBy, user: person.user, name: person.name, designation: person.designation } } : {}) }))} />}
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Name</span>
                    <input
                      value={form[section].name}
                      onChange={(e) => updateSignatory(section, 'name', e.target.value)}
                      className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-1 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Designation</span>
                    <input
                      value={form[section].designation}
                      onChange={(e) => updateSignatory(section, 'designation', e.target.value)}
                      className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-1 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Date</span>
                    <input
                      type="date"
                      value={form[section].date}
                      onChange={(e) => updateSignatory(section, 'date', e.target.value)}
                      className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-1 outline-none"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 pt-4">
            <div className="text-sm text-slate-600">
              Showing {completedRows.length} filled row{completedRows.length === 1 ? '' : 's'} on the sheet.
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Plus size={16} />
                Add Row
              </button>
              <button
                type="button"
                onClick={() => deleteRow(form.items.length - 1)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Trash2 size={16} />
                Remove Last Row
              </button>
              <button
                type="submit"
                disabled={savingRis}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Save size={16} />
                {editingRis ? 'Update RIS' : 'Save Request'}
              </button>
              {user?.role === 'admin' && editingRis && !['ISSUED', 'ACCOUNTABILITY_LOCKED', 'REJECTED'].includes(editingRis.status) && <button
                type="submit" name="action" value="approve" disabled={savingRis}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >{savingRis ? <Skeleton className="h-4 w-20" label="Saving RIS" /> : <><CheckCircle2 size={16} /> Approved</>}</button>}
            </div>
          </div>
        </div>
        </motion.form>
      </>) : null}
    </div>
  );
}
