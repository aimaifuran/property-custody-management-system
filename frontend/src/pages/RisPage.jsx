import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Download, Printer, Plus, Save, RotateCcw, Trash2, CheckCircle2, XCircle, Send, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
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

const initialForm = {
  risNumber: '',
  entityName: '',
  fundCluster: '',
  division: '',
  office: '',
  responsibilityCenterCode: '',
  purpose: '',
  requestedBy: '',
  approvedBy: '',
  issuedBy: '',
  receivedBy: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'PENDING_APPROVAL',
  items: [createRow(), createRow(), createRow(), createRow(), createRow()],
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
  const [ris, setRis] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingRis, setEditingRis] = useState(null);
  const [issueErrors, setIssueErrors] = useState({});
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [stockLoadError, setStockLoadError] = useState('');
  const supplyReviewRef = useRef(null);
  const { user } = useAuth();
  const isSupplyOfficeUser = (user?.office || '').toLowerCase().includes('supply');
  const canReviewRis = user?.role === 'admin' || isSupplyOfficeUser || user?.permissions?.includes('canReviewRIS');
  const canManage = canReviewRis;
  const canEditReview = canReviewRis;

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, []);

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

    try {
      if (!editingRis) return;
      await axios.put(`/ris/${editingRis._id}`, payload);
      toast.success('RIS updated');
      await load();
      resetForm();
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to save RIS';
      toast.error(message);
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
    worksheet.getCell("C37").value = data.requestedBy;
    worksheet.getCell("C38").value = null;
    worksheet.getCell("C39").value = null;
    // Approved by:
    worksheet.getCell("D36").value = null;
    worksheet.getCell("D37").value = data.inspectedBy;
    worksheet.getCell("D38").value = null;
    worksheet.getCell("D39").value = null;
    // Issued by:
    worksheet.getCell("F36").value = null;
    worksheet.getCell("F37").value = data.issuedBy;
    worksheet.getCell("F38").value = null;
    worksheet.getCell("F39").value = null;
    // Received by:
    worksheet.getCell("H36").value = null;
    worksheet.getCell("H37").value = data.receivedBy;
    worksheet.getCell("H38").value = null;
    worksheet.getCell("H39").value = null;
    

    // Generate the modified Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    // Download
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, "RIS.xlsx");
  }

  const editDraft = async (record) => {
    const inputDate = record.date ? new Date(record.date).toISOString().slice(0, 10) : '';
    setEditingRis(record);
    setForm({
      ...initialForm,
      ...record,
      date: inputDate,
      items: (record.items || []).map((item) => ({ ...createRow(), ...item, quantityRequested: item.quantityRequested ?? '' })),
    });
  };

  const printRisForm = (data) => {
    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const value = (field) => escapeHtml(data[field]);
    const formatDate = (date) => {
      if (!date) return '';
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return escapeHtml(date);
      return `${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}/${parsed.getFullYear()}`;
    };
    const items = (data.items || []).slice(0, 20);
    const printWindow = window.open('', '_blank', 'width=1200,height=900');

    if (!printWindow) {
      toast.error('Popup blocked. Please allow popups to print the RIS form.');
      return;
    }

    const rowsHtml = Array.from({ length: 20 }, (_, index) => {
      const item = items[index] || {};
      return `<tr>
        <td>${escapeHtml(item.stockNumber)}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td class="text-left">${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.quantityRequested)}</td>
        <td>${item.isAvailable === true ? '/' : ''}</td>
        <td>${item.isAvailable === false ? '/' : ''}</td>
        <td>${escapeHtml(item.quantityIssued)}</td>
        <td class="text-left">${escapeHtml(item.remarks)}</td>
      </tr>`;
    }).join('');

    const html = `
      <!doctype html>
      <html>
        <head>
          <title>${data.risNumber || 'RIS'}</title>
          <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
          @page { size: letter portrait; margin: 0.35in; }
          body {
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
            color: #000;
            background: #fff;
          }
          h1 { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
          .header-row { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: baseline; gap: 24px; }
          .header-left, .header-right { display: flex; align-items: center; flex: 1; }
          .header-label { font-weight: bold; margin-right: 6px; white-space: nowrap; }
          .input-line { border-bottom: 1px solid #000; flex: 1; min-width: 80px; padding: 0 4px; min-height: 17px; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; }
          th, td { border: 1px solid #333; padding: 6px 4px; text-align: center; vertical-align: middle; height: 27px; }
          th { font-weight: bold; text-transform: capitalize; }
          .text-left { text-align: left; }
          .small-cell { width: 8%; }
          .desc-cell { width: 32%; }
          .purpose-section { margin: 15px 0; }
          .signatures-table { margin-top: 20px; }
          .signatures-table td { border: 1px solid #333; padding: 6px; height: 28px; }
          .sign-label { font-weight: bold; width: 20%; }
          @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Requisition and Issue Slip</h1>
          <div class="header-row"><div class="header-left"><span class="header-label">Entity Name:</span><span class="input-line">${value('entityName')}</span></div><div class="header-right"><span class="header-label">Fund Cluster:</span><span class="input-line">${value('fundCluster')}</span></div></div>
          <div class="header-row"><div class="header-left" style="flex-direction:column;align-items:flex-start"><div style="display:flex;align-items:baseline;margin-bottom:4px"><span class="header-label">Division:</span><span class="input-line">${value('division')}</span></div><div style="display:flex;align-items:baseline"><span class="header-label">Office:</span><span class="input-line">${value('office')}</span></div></div><div class="header-right" style="flex-direction:column;align-items:flex-start"><div style="display:flex;align-items:baseline;margin-bottom:4px"><span class="header-label">Responsibility Center Code:</span><span class="input-line">${value('responsibilityCenterCode')}</span></div><div style="display:flex;align-items:baseline"><span class="header-label">RIS No.:</span><span class="input-line">${value('risNumber')}</span></div></div></div>
            <table>
              <thead><tr><th rowspan="2" class="small-cell">Stock No.</th><th rowspan="2" class="small-cell">Unit</th><th rowspan="2" class="desc-cell">Description</th><th rowspan="2" class="small-cell">Quantity</th><th colspan="3">Stock Available?</th><th rowspan="2" class="small-cell">Remarks</th></tr><tr><th style="width:6%">Yes</th><th style="width:6%">No</th><th class="small-cell">Quantity</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          <div class="purpose-section"><div style="display:flex;align-items:baseline"><span class="header-label">Purpose:</span><span class="input-line">${value('purpose')}</span></div></div>
          <table class="signatures-table"><tr><td class="sign-label"></td><td class="sign-label">Requested by:</td><td class="sign-label">Approved by:</td><td class="sign-label">Issued by:</td><td class="sign-label">Received by:</td></tr><tr><td class="sign-label">Signature:</td><td></td><td></td><td></td><td></td></tr><tr><td class="sign-label">Printed Name:</td><td>${value('requestedBy')}</td><td>${value('approvedBy')}</td><td>${value('issuedBy')}</td><td>${value('receivedBy')}</td></tr><tr><td class="sign-label">Designation:</td><td></td><td></td><td></td><td></td></tr><tr><td class="sign-label">Date:</td><td>${formatDate(data.date)}</td><td>${formatDate(data.date)}</td><td>${formatDate(data.date)}</td><td>${formatDate(data.date)}</td></tr></table>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        toast.error('Unable to open the print dialog.');
      }
    }, 500);

    printWindow.onafterprint = () => {
      printWindow.close();
    };
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
        <h2 className="text-xl font-semibold">Submitted RIS</h2>
        {stockLoadError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {stockLoadError}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
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
                <div>Requested by: {item.requestedBy}</div>
                <div>Approved by: {item.approvedBy || 'Pending'}</div>
                <div>Issued by: {item.issuedBy || 'Pending'}</div>
                <div>Received by: {item.receivedBy}</div>
                {item.rejectionReason ? <div className="md:col-span-2 text-rose-600">Rejection reason: {item.rejectionReason}</div> : null}
              </div>
              {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === 'DRAFT' ? (
                  <button type="button" onClick={() => editDraft(item)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Edit Draft</button>
                ) : null}
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
                  onClick={() => printRisForm(item)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Printer size={16} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => printRisForm(item)}
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
              {issueErrors[item._id] ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {issueErrors[item._id]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
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
            <div className="grid grid-cols-5 border-b border-slate-700 bg-slate-100 text-center text-sm font-semibold">
              <div className="border-r border-slate-700 px-2 py-2">Stock No.</div>
              <div className="border-r border-slate-700 px-2 py-2">Unit</div>
              <div className="border-r border-slate-700 px-2 py-2">Description</div>
              <div className="border-r border-slate-700 px-2 py-2">Quantity</div>
              <div className="px-2 py-2" />
            </div>

            {form.items.map((item, index) => (
              <div key={`ris-row-${index}`} className="grid grid-cols-5 border-b border-slate-300 last:border-b-0">
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

          <div className="mt-4 grid gap-4 border border-slate-700 p-4 lg:grid-cols-[1.5fr_1fr]">
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
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Requested by</span>
              <input
                value={form.requestedBy}
                onChange={(e) => updateForm({ requestedBy: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
                placeholder="Name and signature"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Approved by</span>
              <input
                value={form.approvedBy}
                onChange={(e) => updateForm({ approvedBy: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
                placeholder="Name and signature"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Issued by</span>
              <input
                value={form.issuedBy}
                onChange={(e) => updateForm({ issuedBy: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
                placeholder="Name and signature"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Received by</span>
              <input
                value={form.receivedBy}
                onChange={(e) => updateForm({ receivedBy: e.target.value })}
                className="w-full border-0 border-b border-slate-700 bg-transparent px-1 py-2 outline-none"
                placeholder="Name and signature"
              />
            </label>
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
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Save size={16} />
                Update RIS
              </button>
            </div>
          </div>
        </div>
        </motion.form>
      </>) : null}
    </div>
  );
}
