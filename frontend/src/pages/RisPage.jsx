import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Download, Printer, Plus, Save, RotateCcw, Trash2, CheckCircle2, XCircle, Send, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';
import { SearchInput, Pagination, PageSizeSelect } from '../components/Pagination';
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { useAuth } from '../contexts/AuthContext';

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

const DEFAULT_RIS_LIMIT = 5;
const DEFAULT_RIS_PAGINATION = { page: 1, limit: DEFAULT_RIS_LIMIT, total: 0, totalPages: 1 };

export default function RisPage() {
  const [ris, setRis] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingRis, setEditingRis] = useState(null);
  const [issueErrors, setIssueErrors] = useState({});
  const [issuingIds, setIssuingIds] = useState({});
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [stockLoadError, setStockLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(DEFAULT_RIS_LIMIT);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState(DEFAULT_RIS_PAGINATION);

  const setLimit = (nextLimit) => {
    setLimitState(nextLimit);
    setPage(1);
  };
  const supplyReviewRef = useRef(null);
  const editFormTitleRef = useRef(null);
  const { user } = useAuth();
  const isSupplyOfficeUser = (user?.office || '').toLowerCase().includes('supply');
  const canReviewRis = user?.role === 'admin' || isSupplyOfficeUser || user?.permissions?.includes('canReviewRIS');
  const canManage = canReviewRis;
  const canEditReview = canReviewRis;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async () => {
    setStockLoadError('');
    setLoading(true);

    try {
      const [risResult, itemsResult] = await Promise.allSettled([
        axios.get('/ris', { params: { page, limit, search: search || undefined } }),
        axios.get('/items'),
      ]);

      if (risResult.status === 'fulfilled') {
        setRis(risResult.value.data.data?.items || []);
        setPagination(risResult.value.data.data?.pagination || { ...DEFAULT_RIS_PAGINATION, limit });
      } else {
        setRis([]);
        setPagination({ ...DEFAULT_RIS_PAGINATION, limit });
      }

      if (itemsResult.status === 'fulfilled') {
        setItems(itemsResult.value.data.data || []);
      } else {
        setItems([]);
        setStockLoadError('Unable to load stock list. Please refresh the page or check your account permissions.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, limit, search]);

  useEffect(() => {
    if (!reviewTarget || !reviewDraft || !supplyReviewRef.current) return;
    supplyReviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    supplyReviewRef.current.focus({ preventScroll: true });
  }, [reviewTarget, reviewDraft]);

  useEffect(() => {
    if (editingRis) editFormTitleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingRis]);

  const completedRows = useMemo(
    () => form.items.filter((item) => item.stockNumber || item.unit || item.description),
    [form.items],
  );

  const selectedInventoryMap = useMemo(
    () => new Map(items.map((entry) => [entry.stockNumber, entry])),
    [items],
  );

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const updateSignatory = (section, key, value) => setForm((prev) => ({
    ...prev,
    [section]: { ...prev[section], [key]: value },
  }));

  const updateItem = (index, key, value) => {
    setForm((prev) => {
      const nextItems = prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (key === 'stockNumber') {
          const selected = selectedInventoryMap.get(value);
          return {
            ...item,
            stockNumber: value,
            unit: selected?.unit || '',
            description: selected?.description || '',
          };
        }
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
    setForm(initialForm);
    setEditingRis(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (e) => {
    e.preventDefault();

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

    if (!editingRis) return;
    setSaving(true);
    try {
      await axios.put(`/ris/${editingRis._id}`, payload);
      toast.success('RIS updated');
      await load();
      resetForm();
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to save RIS';
      toast.error(message);
    } finally {
      setSaving(false);
    }
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
    setReviewSaving(true);
    try {
      await axios.post(`/ris/${reviewTarget._id}/review`, { items: reviewDraft.items });
      toast.success('RIS reviewed');
      setReviewTarget(null);
      setReviewDraft(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to save review');
    } finally {
      setReviewSaving(false);
    }
  };

  const approveRis = async (id) => {
    try {
      await axios.post(`/ris/${id}/approve`);
      toast.success('RIS approved');
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
    setIssuingIds((prev) => ({ ...prev, [id]: true }));
    try {
      setIssueErrors((prev) => ({ ...prev, [id]: '' }));
      await axios.post(`/ris/${id}/issue`);
      toast.success('RIS issued and accountability locked');
      await load();
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to issue RIS';
      setIssueErrors((prev) => ({ ...prev, [id]: message }));
    } finally {
      setIssuingIds((prev) => ({ ...prev, [id]: false }));
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
    const existingPdfBytes = await fetch("/forms/templates/ris-template.pdf").then(res =>
        res.arrayBuffer()
    );

    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const form = pdfDoc.getForm();

    form.getTextField("entityName").setText(String(data.entityName));
    form.getTextField("fundCluster").setText(String(data.fundCluster));
    form.getTextField("division").setText(String(data.division));
    form.getTextField("office").setText(String(data.office));
    form.getTextField("responsibilityCenterCode").setText(String(data.responsibilityCenterCode));
    form.getTextField("risNumber").setText(String(data.risNumber));

    // Table data insertion
    const startRowNumber = 1; // Starting row for table data
    data.items.forEach((item, index) => {
      form.getTextField(`stockNumber${index + 1}`).setText(String(item.stockNumber ?? ''));
      form.getTextField(`unit${index + 1}`).setText(String(item.unit ?? ''));
      form.getTextField(`description${index + 1}`).setText(String(item.description ?? ''));
      form.getTextField(`quantityRequested${index + 1}`).setText(String(item.quantityRequested ?? ''));
      form.getTextField(`yes${index + 1}`).setText(String(item.isAvailable ? '/' : ''));
      form.getTextField(`no${index + 1}`).setText(String(!item.isAvailable ? '/' : ''));
      form.getTextField(`quantityIssued${index + 1}`).setText(String(item.quantityIssued <= 0 ? '' : item.quantityIssued));
      form.getTextField(`remarks${index + 1}`).setText(String(item.remarks || ''));
    });

    
    form.getTextField("purpose").setText(String(data.purpose ?? ''));

    // Requested by
    form.getTextField("requestedByName").setText(String(data.requestedBy?.name || ''));
    form.getTextField("requestedByDesignation").setText(String(data.requestedBy?.designation || ''));
    form.getTextField("requestedByDate").setText(String(formatDate(data.requestedBy?.date ?? '')));

    // Approved by
    form.getTextField("approvedByName").setText(String(data.approvedBy?.name || ''));
    form.getTextField("approvedByDesignation").setText(String(data.approvedBy?.designation || ''));
    form.getTextField("approvedByDate").setText(String(formatDate(data.approvedBy?.date ?? '')));

    // Issued by
    form.getTextField("issuedByName").setText(String(data.issuedBy?.name || ''));
    form.getTextField("issuedByDesignation").setText(String(data.issuedBy?.designation || ''));
    form.getTextField("issuedByDate").setText(String(formatDate(data.issuedBy?.date ?? '')));

    // Received by
    form.getTextField("receivedByName").setText(String(data.receivedBy?.name || ''));
    form.getTextField("receivedByDesignation").setText(String(data.receivedBy?.designation || ''));
    form.getTextField("receivedByDate").setText(String(formatDate(data.receivedBy?.date ?? '')));

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
        "RIS.pdf"
      );
    }
  };

  const editDraft = async (record) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Requisition & Issue Slip</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Submitted RIS</h2>
          <div className="flex flex-wrap items-center justify-end gap-5 w-[500px]">
            <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Search entity, division, office, purpose, signatories…" />
            <PageSizeSelect limit={limit} onChange={setLimit} />
          </div>
        </div>
        {stockLoadError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {stockLoadError}
          </div>
        ) : null}
        {loading ? <SkeletonList count={3} actions={4} /> : (
        <div className="mt-4 space-y-3">
          {ris.length === 0 && <p className="text-sm text-slate-500">No RIS records yet.</p>}
          {ris.map((item) => (
            <div key={item._id} className="rounded-xl border border-slate-200 p-4">
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
              <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                <div>Requested by: {item.requestedBy?.name || 'N/A'}</div>
                <div>Approved by: {item.approvedBy?.name || 'Pending'}</div>
                <div>Issued by: {item.issuedBy?.name || 'Pending'}</div>
                <div>Received by: {item.receivedBy?.name || 'N/A'}</div>
                {item.rejectionReason ? <div className="md:col-span-2 text-rose-600">Rejection reason: {item.rejectionReason}</div> : null}
              </div>
              {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => editDraft(item)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Update</button>
                <button
                  type="button"
                  onClick={() => generateExcel(item)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Download size={16} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => generatePdf(item)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Printer size={16} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => generatePdf(item, true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Printer size={16} />
                  Print
                </button>
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
                      disabled={!!issuingIds[item._id]}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {issuingIds[item._id] ? <Spinner size={16} /> : <Send size={16} />}
                      {issuingIds[item._id] ? 'Issuing…' : 'Issue RIS'}
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
              {issueErrors[item._id] ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {issueErrors[item._id]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        )}
        {!loading && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />}
      </div>

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
                    disabled={reviewSaving}
                    className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                  >
                    {reviewSaving && <Spinner size={14} />}
                    {reviewSaving ? 'Saving…' : 'Save Review'}
                  </button>
                  <button
                    type="button"
                    onClick={() => issueRis(reviewTarget._id)}
                    disabled={!!issuingIds[reviewTarget._id]}
                    className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {issuingIds[reviewTarget._id] && <Spinner size={14} />}
                    {issuingIds[reviewTarget._id] ? 'Issuing…' : 'Issue RIS'}
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
                  View only
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-hidden border border-slate-700">
            <div className="grid grid-cols-8 border-b border-slate-700 bg-slate-100 text-center text-sm font-semibold">
              <div className="col-span-4 border-r border-slate-700 py-2 italic">Requisition</div>
              <div className="col-span-4 py-2 italic">Stock Available?</div>
            </div>
            <div className="grid grid-cols-8 border-b border-slate-700 text-center text-sm font-semibold">
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
              <div key={`${reviewDraft._id}-review-${index}`} className="grid grid-cols-8 border-b border-slate-300 last:border-b-0">
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
          </div>
        </div>
      ) : null}

      {editingRis ? (<>
      <hr className="border-slate-300 border-2" />

      <div ref={editFormTitleRef} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Update Requisition & Issue Slip</h1>
          <p className="text-sm text-slate-500">Edit the selected RIS draft and save the updated record.</p>
          <p className="text-xs text-slate-400">RIS items and total cost remain linked to the originating IAR.</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <RotateCcw size={16} />
                Close Editor
        </button>
      </div>
      
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={save}
        className="mx-auto max-w-6xl rounded-3xl border border-slate-300 bg-white p-4 shadow-xl"
      >
        <div className="rounded-2xl border-2 border-slate-700 p-4 text-slate-900">
          <div className="border-b border-slate-300 pb-3 text-center">
            <h2 className="text-2xl font-black tracking-wide">REQUISITION AND ISSUE SLIP</h2>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
            <div className="space-y-3">
              <label className="grid grid-cols-[130px_1fr] items-end gap-3 text-sm font-semibold">
                <span>Entity Name:</span>
                <input
                  value={form.entityName}
                  onChange={(e) => updateForm({ entityName: e.target.value })}
                  className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-1 font-semibold outline-none focus:border-slate-900"
                />
              </label>
            </div>
            <label className="grid grid-cols-[130px_1fr] items-end gap-3 text-sm font-semibold lg:justify-self-end lg:w-full">
              <span className="text-right">Fund Cluster:</span>
              <input
                value={form.fundCluster}
                onChange={(e) => updateForm({ fundCluster: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-1 text-center font-semibold outline-none focus:border-slate-900"
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-[170px_1fr_1.2fr] border border-slate-700">
            <div className="border-r border-slate-700">
              <div className="border-b border-slate-700 px-2 py-3 text-sm">Division:</div>
              <div className="px-2 py-[0.77rem] text-sm">Office:</div>
            </div>
            <div className="border-r border-slate-700">
              <div className="border-b border-slate-700 px-3 py-[0.4rem] ">
                <input
                  value={form.division}
                  onChange={(e) => updateForm({ division: e.target.value })}
                  className="w-full border-0 bg-transparent px-0 py-1 outline-none"
                />
              </div>
              <div className="px-3 py-2">
                <input
                  value={form.office}
                  onChange={(e) => updateForm({ office: e.target.value })}
                  className="w-full border-0 bg-transparent px-0 py-1 outline-none"
                />
              </div>
            </div>
            <div>
              <div className="border-b border-slate-700 px-[0.8rem] py-[0.77rem] text-sm">
                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <span>Responsibility Center Code:</span>
                  <input
                    value={form.responsibilityCenterCode}
                    onChange={(e) => updateForm({ responsibilityCenterCode: e.target.value })}
                    className="w-full border-0 bg-transparent px-0 py-0 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-3 px-[0.8rem] py-[0.77rem] text-sm">
                <span>RIS No.:</span>
                <input
                  value={form.risNumber}
                  onChange={(e) => updateForm({ risNumber: e.target.value })}
                  className="w-full border-0 bg-transparent px-0 py-0 text-center font-semibold outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden border border-slate-700">
            <div className="grid grid-cols-9 border-b border-slate-700 bg-slate-100 text-center text-sm font-semibold">
              <div className="col-span-4 border-r border-slate-700 py-2 italic">Requisition</div>
              <div className="col-span-4 border-r border-slate-700 py-2 italic">Stock Available?</div>
              <div className="py-2" />
            </div>
            <div className="grid grid-cols-9 border-b border-slate-700 text-center text-sm font-semibold">
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
              <div key={`ris-row-${index}`} className="grid grid-cols-9 border-b border-slate-300 last:border-b-0">
                <div className="border-r border-slate-300 p-1">
                  <select
                    value={item.stockNumber}
                    onChange={(e) => updateItem(index, 'stockNumber', e.target.value)}
                    className="w-full border-0 bg-transparent px-2 py-2 text-sm outline-none"
                  >
                    <option value="">Select stock</option>
                    {items.map((entry) => (
                      <option key={entry._id} value={entry.stockNumber}>
                        {entry.stockNumber} - {entry.description}
                      </option>
                    ))}
                  </select>
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
          </div>

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
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Spinner size={16} /> : <Save size={16} />}
                {saving ? 'Updating…' : 'Update RIS'}
              </button>
            </div>
          </div>
        </div>
        </motion.form>
      </>) : null}
    </div>
  );
}
