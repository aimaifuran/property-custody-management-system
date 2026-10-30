import SearchInput from '../components/SearchInput';
import SignatoryValue from '../components/SignatoryValue';
import useSourceDocument from '../utils/useSourceDocument';
import { todayManila } from '../utils/formDates';
import IarSourceSelect from '../components/IarSourceSelect';
import { hasRowData } from '../utils/formRows';
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
import { getAccountableOwner, matchSourceRowsToAccountabilities } from '../utils/ptrIssuedItems';

const FIXED_TRANSFER_TYPES = ['Donation', 'Reassignment', 'Relocation'];

const emptyItem = () => ({
    dateAcquired: todayManila(),
    propertyNumber: '',
    itemName: '',
    description: '',
    amount: '',
    condition: ''
});

const emptySignatory = () => ({ name: '', designation: '', date: todayManila() });

const getIssuedItemName = (asset) => {
    const stockItem = asset.inventory?.item;
    return stockItem?.name || 'Item name unavailable';
};

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
    date: todayManila(),
    items: [emptyItem()],
    approvedBy: getStickySignatory('approvedBy', emptySignatory()),
    issuedBy: getStickySignatory('issuedBy', emptySignatory()),
    receivedBy: emptySignatory()
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
    toUser: record.toUser?._id || record.toUser || '',
    ptrNumber: record.ptrNumber || '',
    date: toDateInputValue(record.date),
    transferTypeChoice: FIXED_TRANSFER_TYPES.includes(record.transferType) ? record.transferType : 'Other',
    transferTypeOther: FIXED_TRANSFER_TYPES.includes(record.transferType) ? '' : (record.transferType || ''),
    items: record.items && record.items.length ? record.items.map((item) => ({
        inventory: item.inventory, property: item.property, serialNumber: item.serialNumber,
        returnSlip: item.returnSlip, returnSlipItem: item.returnSlipItem,
        dateAcquired: toDateInputValue(item.dateAcquired) || todayManila(),
        propertyNumber: item.propertyNumber || '',
        itemName: item.itemName || item.inventory?.item?.name || '',
        description: item.description || '',
        quantity: item.quantity ?? '',
        amount: item.amount ?? '',
        condition: item.condition || ''
    })) : [],
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
    const [selectedFromAccountableUserId, setSelectedFromAccountableUserId] = useState('');
    const [returnDrafts, setReturnDrafts] = useState([]);
    const [returnDraftItem, setReturnDraftItem] = useState(null);
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
    const workflow = !!activeRecord?.fromUser && activeRecord.status !== 'RECORDED';
    const canProcess = workflow && (isUser ? String(activeRecord.toUser) === String(user?._id) && activeRecord.status === 'PENDING_RECEIVER' : ['PENDING_RECEIVER', 'PENDING_ADMIN'].includes(activeRecord.status) && (decision === 'reject' || activeRecord.status === 'PENDING_ADMIN'));
    const [editorOpen, setEditorOpen] = useState(true);
    const [savedView, setSavedView] = useState('records');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const [returnDraftSearch, setReturnDraftSearch] = useState('');
  const [returnDraftPage, setReturnDraftPage] = useState(1);
  const filteredReports = filterReports(sortSavedReports(reports), search);
  const savedPrsItems = new Set(reports.flatMap(report => (report.items || []).filter(item => item.returnSlip && item.returnSlipItem).map(item => `${item.returnSlip}:${item.returnSlipItem}`)));
  const availableReturnDrafts = returnDrafts.filter(draft => !savedPrsItems.has(`${draft.item?.returnSlip}:${draft.item?.returnSlipItem}`));
  const filteredReturnDrafts = availableReturnDrafts.filter(draft => [draft.prsNumber, draft.fromAccountableOfficer, draft.item?.itemName, draft.item?.description, draft.item?.propertyNumber].some(value => String(value || '').toLocaleLowerCase().includes(returnDraftSearch.toLocaleLowerCase())));
  const returnDraftPageCount = Math.max(1, Math.ceil(filteredReturnDrafts.length / perPage));
  const currentReturnDraftPage = Math.min(returnDraftPage, returnDraftPageCount);
  const visibleReturnDrafts = filteredReturnDrafts.slice((currentReturnDraftPage - 1) * perPage, currentReturnDraftPage * perPage);
    const { editorRef, recordsRef, updatedId, savedUpdate, markUpdated, scrollToRecords } = useUpdateFormNavigation(editingId);
    useSavedReportPage(filteredReports, savedUpdate, perPage, setPage);

    const load = async () => {
      setPageLoading(true);
      setPageLoadError('');
      try {

        const [records, inventory, users, returns] = await Promise.all([axios.get('/ptr'), axios.get('/custody/assets'), axios.get('/custody/people'), axios.get('/ptr/return-item-drafts')]);
        setReports(records.data.data || []); setAssets(inventory.data.data || []); setPeople(users.data.data || []); setReturnDrafts(returns.data.data || []);

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
    const transferableAssets = assets.filter(asset => asset.acceptedAt && !asset.pendingMovement && Number(asset.quantityRemaining) > 0);
    const adminTransferableAssets = transferableAssets.filter(asset => asset.user);
    const selectedSourceAssets = form.items
        .map(item => transferableAssets.find(asset => String(asset._id) === String(item.accountability)))
        .filter(Boolean);
    const selectedSourceOwnerIds = [...new Set(selectedSourceAssets.map(asset => String(asset.user?._id || asset.user)))];
    const fromAccountableOptions = people
        .map(person => ({ value: String(person._id), label: person.name, keywords: person.office || '' }))
        .filter(option => option.value && option.label);

    const adminSourceItemOptions = rowIndex => {
        const otherSelectedOwnerIds = [...new Set(form.items
            .filter((_, index) => index !== rowIndex)
            .map(item => adminTransferableAssets.find(asset => String(asset._id) === String(item.accountability)))
            .filter(Boolean)
            .map(asset => String(asset.user?._id || asset.user)))];
        return adminTransferableAssets
            .filter(asset => {
                const ownerId = String(asset.user?._id || asset.user);
                return (!selectedFromAccountableUserId || ownerId === selectedFromAccountableUserId) &&
                    (!otherSelectedOwnerIds.length || otherSelectedOwnerIds.includes(ownerId));
            })
            .map(asset => {
                const stockItem = asset.inventory?.item;
                const { name: ownerName } = getAccountableOwner(asset, people);
                const itemName = getIssuedItemName(asset);
                return {
                    value: asset._id,
                    label: `${itemName} · ${asset.propertyNumber || asset.inventory?.propertyNumber || stockItem?.stockNumber || 'No property number'} · ${ownerName}`,
                    keywords: `${stockItem?.description || ''} ${stockItem?.stockNumber || ''} ${asset.documentNumber || ''}`,
                };
            });
    };

    const updateAdminSourceSearch = (rowIndex, value) => {
        setSelectedFromAccountableUserId('');
        setForm(previous => ({
            ...previous,
            fromAccountableOfficer: '',
            items: previous.items.map((item, index) => index === rowIndex ? {
                ...item,
                accountability: undefined,
                inventory: undefined,
                property: undefined,
                serialNumber: '',
                propertyNumber: '',
                itemName: value,
                description: '',
                amount: '',
                condition: '',
            } : item),
        }));
    };

    const selectAdminSourceItem = (rowIndex, option) => {
        const asset = adminTransferableAssets.find(candidate => String(candidate._id) === String(option.value));
        if (!asset) return;
        const stockItem = asset.inventory?.item;
        const owner = getAccountableOwner(asset, people);
        setSelectedFromAccountableUserId(owner.userId);
        setForm(previous => ({
            ...previous,
            fromAccountableOfficer: owner.name,
            items: previous.items.map((item, index) => index === rowIndex ? {
                ...item,
                accountability: asset._id,
                inventory: asset.inventory?._id,
                property: asset.inventory?.property,
                serialNumber: asset.serialNumber || asset.inventory?.serialNumber || '',
                dateAcquired: toDateInputValue(asset.inventory?.purchaseDate) || todayManila(),
                propertyNumber: asset.propertyNumber || asset.inventory?.propertyNumber || stockItem?.stockNumber || '',
                itemName: getIssuedItemName(asset),
                description: stockItem?.description || '',
                amount: Number(asset.quantityRemaining || 0) * Number(asset.inventory?.unitCost || 0),
                condition: asset.condition || 'Serviceable',
            } : item),
        }));
    };

    const selectSourcePropertyRecord = (report, sourceForm) => {
        const sourceRows = (report.items || []).filter(item => (item.acceptedQuantity ?? item.quantity) > 0);
        const sourceMatches = matchSourceRowsToAccountabilities(sourceRows, assets);
        const eligibleSourceMatches = sourceMatches.map(candidates => candidates.filter(asset =>
            transferableAssets.some(eligible => String(eligible._id) === String(asset._id))
        ));
        const items = sourceForm.items.map((item, index) => {
            const eligibleCandidates = eligibleSourceMatches[index] || [];
            const asset = eligibleCandidates.length === 1 ? eligibleCandidates[0] : null;
            if (!asset) return item;
            const stockItem = asset.inventory?.item;
            return {
                ...item,
                accountability: asset._id,
                inventory: asset.inventory?._id,
                property: asset.inventory?.property,
                serialNumber: asset.serialNumber || asset.inventory?.serialNumber || '',
                propertyNumber: asset.propertyNumber || asset.inventory?.propertyNumber || item.propertyNumber,
                itemName: stockItem?.name || (stockItem?.category !== 'General' ? stockItem?.category : '') || item.itemName,
                description: stockItem?.description || item.description,
                dateAcquired: toDateInputValue(asset.inventory?.purchaseDate) || item.dateAcquired || todayManila(),
                amount: Number(asset.quantityRemaining || 0) * Number(asset.inventory?.unitCost || 0),
                condition: asset.condition || 'Serviceable',
            };
        });
        const matchedAssets = eligibleSourceMatches.flat();
        const ownerIds = [...new Set(matchedAssets.map(asset => String(asset.user?._id || asset.user)).filter(Boolean))];
        const owner = ownerIds.length === 1 ? people.find(person => String(person._id) === ownerIds[0]) : null;
        const accountableName = owner?.name || (ownerIds.length === 1 ? matchedAssets.find(asset => String(asset.user?._id || asset.user) === ownerIds[0])?.employee : '') || '';
        setSelectedFromAccountableUserId(ownerIds.length === 1 ? ownerIds[0] : '');
        setForm(previous => ({
            ...previous,
            ...sourceForm,
            items,
            fromAccountableOfficer: accountableName,
        }));
    };

    const clearSourcePropertyRecord = () => {
        setSelectedFromAccountableUserId('');
        setForm(previous => ({
            ...previous,
            iar: undefined,
            fromAccountableOfficer: '',
            items: [emptyItem()],
        }));
    };

    const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updateSignatory = (section, key, value) => setForm((prev) => {
        const signatory = { ...prev[section], [key]: value };
        return { ...prev, [section]: signatory };
    });

    const updateItem = (index, key, value) => setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));

    const addItem = () => update('items', [...form.items, emptyItem()]);

    const startEdit = (record) => {
        cancelNumberPreview();
        setSelectedFromAccountableUserId('');
        setEditorOpen(true);
        setSavedView('records');
        setReturnDraftItem(null);
        setEditingId(record._id);
        setForm(toForm(record)); setDecision('confirm'); setRejectionReason('');
    };

    const startReturnDraft = (draft) => {
        cancelNumberPreview();
        setSelectedFromAccountableUserId('');
        const adminName = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || user?.username || '';
        const adminSignatory = { name: adminName, designation: user?.office || '', date: todayManila() };
        setEditorOpen(true);
        setEditingId(null);
        setReturnDraftItem(draft);
        setForm({
            ...makeForm(),
            entityName: draft.lguName || 'LGU Carigara',
            fundCluster: draft.fundCluster || 'General Fund',
            ptrNumber: form.ptrNumber,
            fromAccountableOfficer: draft.fromAccountableOfficer,
            toAccountableOfficer: '',
            toUser: '',
            date: todayManila(),
            transferTypeChoice: 'Reassignment',
            transferTypeOther: '',
            reasonForTransfer: `Returned item from PRS ${draft.prsNumber || ''}`.trim(),
            approvedBy: adminSignatory,
            issuedBy: adminSignatory,
            receivedBy: emptySignatory(),
            items: [{ ...draft.item, dateAcquired: toDateInputValue(draft.item.dateAcquired) || todayManila() }],
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setReturnDraftItem(null);
        setSelectedFromAccountableUserId('');
        setForm(makeForm()); setDecision('confirm'); setRejectionReason('');
        refreshNumberPreview();
    };

    const save = async (event) => {
        event.preventDefault();
        if (saving) return;
        if (returnDraftItem && !form.toUser) return toast.error('Search and select the new accountable officer.');
        if (!isUser && !editingId && !returnDraftItem) {
            if (form.items.some(item => !item.accountability)) return toast.error('Search and select an issued item for each PTR row.');
            if (!selectedFromAccountableUserId || !selectedSourceOwnerIds.includes(selectedFromAccountableUserId)) {
                return toast.error('Search and select the accountable user for the selected item.');
            }
            if (!form.toUser) return toast.error('Search and select the new accountable officer.');
            if (selectedSourceOwnerIds.includes(String(form.toUser))) return toast.error('Select a different accountable officer for the transfer.');
        }
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
            ...(!isUser && !editingId || returnDraftItem || form.items.some(item => item.returnSlip) ? { toUser: form.toUser } : {}),
            items: form.items.filter(item => hasRowData(item, emptyItem())).map((item) => ({
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
                await axios.post('/custody/transfers', { accountability: form.items[0]?.accountability, toUser: form.toUser, reason: form.reasonForTransfer, entityName: form.entityName, fundCluster: form.fundCluster, transferType, remarks: form.remarks, dateAcquired: form.items[0]?.dateAcquired });
                toast.success('PTR sent to the receiving custodian');
            } else if (editingId) {
                await axios.put(`/ptr/${editingId}`, payload);
                toast.success('PTR updated');
                markUpdated(editingId);
            } else {
                const { data } = await axios.post('/ptr', payload);
                setReports(previous => [data.data, ...previous]);
                if (returnDraftItem) {
                    const transferred = new Set((data.data.items || []).map(item => `${item.returnSlip}:${item.returnSlipItem}`));
                    setReturnDrafts(previous => previous.filter(draft => !transferred.has(`${draft.item?.returnSlip}:${draft.item?.returnSlipItem}`)));
                    setReturnDraftPage(1);
                    markUpdated(data.data._id);
                }
                toast.success(returnDraftItem ? 'Item transferred and saved in Saved Records. Removed from drafts.' : 'PTR created');
            }
            setSearch('');
            setEditorOpen(false);
            setSavedView('records');
            setEditingId(null);
            setReturnDraftItem(null);
            setSelectedFromAccountableUserId('');
            setForm(makeForm()); setDecision('confirm'); setRejectionReason('');
            refreshNumberPreview();
            await load();
            if (editingId || returnDraftItem) scrollToRecords();
        } catch (error) {
            if (returnDraftItem && error.response?.data?.errors?.some(entry => entry.code === 'TRANSFER_SOURCE_UNAVAILABLE')) {
                setReturnDrafts(previous => previous.filter(draft => draft._id !== returnDraftItem._id));
                cancelEdit();
                setEditorOpen(false);
                setSavedView('return-drafts');
                setReturnDraftPage(1);
                toast('This item is no longer available and has been removed from drafts.');
                await load();
            } else toast.error(error?.response?.data?.message || 'Unable to save PTR');
        } finally { setSaving(false); }
    };

    const field = (label, key, type = 'text') => key === 'fromAccountableOfficer' && returnDraftItem ? (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input aria-label={label} readOnly value={form.fromAccountableOfficer} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" />
        </label>
    ) : key === 'fromAccountableOfficer' && !isUser && !editingId && !returnDraftItem ? (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <SearchInput required aria-label={label} placeholder="Search accountable officer" value={form.fromAccountableOfficer || ''} options={fromAccountableOptions} openOnFocus onChange={value => { setSelectedFromAccountableUserId(''); update('fromAccountableOfficer', value); }} onSelect={option => { setSelectedFromAccountableUserId(option.value); update('fromAccountableOfficer', option.label); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
    ) : key === 'toAccountableOfficer' && returnDraftItem ? (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">To New Accountable Officer</span>
            <SearchInput required aria-label="To New Accountable Officer" placeholder="Search To New Accountable Officer" value={form.toAccountableOfficer || ''} options={people.filter(person => String(person._id) !== String(returnDraftItem.returnedBy?.user || '')).map(person => ({ value: person._id, label: person.name, keywords: person.office }))} onChange={value => setForm(previous => ({ ...previous, toAccountableOfficer: value, toUser: '', receivedBy: { ...previous.receivedBy, user: undefined, name: '', designation: '' } }))} onSelect={option => { const person = people.find(row => row._id === option.value); if (person) setForm(previous => ({ ...previous, toUser: person._id, toAccountableOfficer: person.name, receivedBy: { ...previous.receivedBy, user: person._id, name: person.name, designation: person.office || '', date: todayManila() } })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    ) : key === 'toAccountableOfficer' && isUser && !editingId ? <label className="block"><span className="mb-1 block text-sm font-semibold">{label}</span><select required value={form.toUser || ''} onChange={event => { const person = people.find(row => row._id === event.target.value); setForm(previous => ({ ...previous, toUser: event.target.value, toAccountableOfficer: person?.name || '', receivedBy: { ...previous.receivedBy, user: person?._id, name: person?.name || '', designation: person?.office || '' } })); }} className="w-full rounded-xl border p-2"><option value="">Select receiving custodian</option>{people.map(person => <option key={person._id} value={person._id}>{person.name} - {person.office}</option>)}</select></label> : key === 'entityName' && returnDraftItem ? <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input aria-label={label} readOnly value={form.entityName} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" /></label> : key === 'entityName' ? <EntityNameField value={form.entityName} onChange={value => update('entityName', value)} isNew={!editingId} /> : ['fromAccountableOfficer', 'toAccountableOfficer'].includes(key) && !isUser ? (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <SearchInput aria-label={label} placeholder={`Enter ${label.toLowerCase()}`} value={form[key] || ''} options={people.map(person => ({ value: person._id, label: person.name, keywords: person.office }))} onChange={value => setForm(previous => ({ ...previous, [key]: value, ...(key === 'toAccountableOfficer' ? { toUser: '' } : {}) }))} onSelect={key === 'toAccountableOfficer' ? option => { const person = people.find(row => row._id === option.value); if (person) setForm(previous => ({ ...previous, toUser: person._id, toAccountableOfficer: person.name })); } : undefined} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    ) : (
        <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
            <input required aria-label={label} readOnly={(key === 'ptrNumber' && !editingId) || (isUser && key === 'fromAccountableOfficer') || (returnDraftItem && key === 'date')} type={type} placeholder={key === 'entityName' ? 'e.g., Municipality of Carigara' : key === 'fundCluster' ? 'e.g., General Fund' : key === 'ptrNumber' ? 'Assigned on save' : `Enter ${label.toLowerCase()}`} value={form[key] || ''} onChange={(e) => update(key, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
        </label>
    );

    const signatoryFields = (label, section) => (
        <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">{label}</h3>
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
                    {section === 'receivedBy' ? <SearchInput aria-label="Received By Name" placeholder="Enter name or select a custodian" value={form[section].name} options={people.map(person => ({ value: person._id, label: person.name, keywords: person.office }))} onChange={value => updateSignatory(section, 'name', value)} onSelect={option => {
                        const person = people.find(row => row._id === option.value);
                        if (person) setForm(previous => ({ ...previous, [section]: { ...previous[section], name: person.name, designation: person.office || previous[section].designation } }));
                    }} className="w-full rounded-xl border border-slate-200 px-3 py-2" /> : <SignatoryValue value={form[section].name} onChange={(e) => updateSignatory(section, 'name', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" formType="ptr" role={section} field="name" managed={(!editingId) && !form[section].user && !form[section].offlineRecipient && !(['requestedBy', 'receivedBy', 'returnedBy'].includes(section) && form[section].name)} />}
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">Designation</span>
                    <SignatoryValue  value={form[section].designation} onChange={(e) => updateSignatory(section, 'designation', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" formType="ptr" role={section} field="designation" managed={(!editingId) && !form[section].user && !form[section].offlineRecipient && !(['requestedBy', 'receivedBy', 'returnedBy'].includes(section) && form[section].name)} />
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

    useSourceDocument(reports, setReports, startEdit, '/ptr');

    if (pageLoading) return <PageSkeleton />;
    if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
        <div className="space-y-6">
            <nav aria-label="Property Transfer Report sections" className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={editorOpen} onClick={() => setEditorOpen(true)} className={`rounded-xl border px-4 py-2 font-semibold ${editorOpen ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>Property Transfer Report</button>
                <button type="button" aria-pressed={!editorOpen && savedView === 'records'} onClick={() => { setEditorOpen(false); setSavedView('records'); }} className={`rounded-xl border px-4 py-2 font-semibold ${!editorOpen && savedView === 'records' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>Saved Records</button>
                {!isUser && <button type="button" aria-pressed={!editorOpen && savedView === 'return-drafts'} onClick={() => { setEditorOpen(false); setSavedView('return-drafts'); setReturnDraftPage(1); }} className={`rounded-xl border px-4 py-2 font-semibold ${!editorOpen && savedView === 'return-drafts' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>Drafts from PRS{availableReturnDrafts.length > 0 && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">{availableReturnDrafts.length}</span>}</button>}
            </nav>
            {!editorOpen && savedView === 'records' && <div ref={recordsRef} className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader search={search} onSearch={value => { setSearch(value); setPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setPage(1); }}></SavedReportsHeader>
                {reports.length === 0 && <p className="mt-3 text-sm text-slate-500">No Property Transfer Reports yet.</p>}
                {visibleReports.map((item) => (
                    <div key={item._id} className={`saved-record mt-3 flex items-center justify-between rounded-xl border p-3 ${updatedId === item._id ? 'border-emerald-400 ring-2 ring-emerald-200 animate-pulse' : 'border-slate-200'}`}><NewFormBadge record={item} />
                        <div>
                            <b>{item.ptrNumber}</b><p className="mt-1 text-sm">{item.items?.[0]?.itemName || item.items?.[0]?.inventory?.item?.name || 'Item name unavailable'}</p>
                            <div className="text-sm text-slate-500">
                                {item.fromAccountableOfficer || 'N/A'} {'->'} {item.toAccountableOfficer || 'N/A'} · {item.transferType || 'N/A'}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {/* <button type="button" onClick={() => generateDoc(item)} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Docx</button> */}
                            <RecordActionButton action="pdf" title="Download PDF" onClick={() => generatePdf(item)} />
                            <RecordActionButton action="print" title="Print record" onClick={() => generatePdf(item, true)} />
                        </div>
                    </div>
                ))}
                <Pagination showPageSize={false} page={page} pageCount={pageCount} perPage={perPage} onPageChange={setPage} onPerPageChange={(value) => { setPerPage(value); setPage(1); }} />
            </div>}
            {!editorOpen && savedView === 'return-drafts' && <div className="saved-records rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <SavedReportsHeader title="Returned Items from PRS" searchPlaceholder="Search PRS, accountable officer, or item" search={returnDraftSearch} onSearch={value => { setReturnDraftSearch(value); setReturnDraftPage(1); }} perPage={perPage} onPerPage={value => { setPerPage(value); setReturnDraftPage(1); }} />
                <p className="mt-2 text-sm text-slate-600">Select a received PRS item to transfer. Once saved, the item moves out of Drafts from PRS and appears in Saved Records.</p>
                {visibleReturnDrafts.length === 0 && <p className="mt-3 text-sm text-slate-500">{availableReturnDrafts.length ? 'No matching PRS items.' : 'No unassigned saved PRS items available for PTR drafts.'}</p>}
                <div className="mt-3 space-y-3">
                    {visibleReturnDrafts.map(draft => <div key={draft._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                        <NewFormBadge record={draft} />
                        <div>
                            <b>{draft.item?.itemName || draft.item?.inventory?.item?.name || 'Returned item'}</b>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                                <span>PRS {draft.prsNumber || 'N/A'}</span>
                                <span>{draft.fromAccountableOfficer || 'N/A'}</span>
                                <span>Qty {draft.item?.quantity ?? 'N/A'}</span>
                                <span>Property No. {draft.item?.propertyNumber || 'N/A'}</span>
                                <span>{draft.item?.condition || 'Serviceable'}</span>
                            </div>
                        </div>
                        <RecordActionButton action="edit" title="Edit PTR draft" onClick={() => startReturnDraft(draft)} />
                    </div>)}
                </div>
                <Pagination showPageSize={false} page={currentReturnDraftPage} pageCount={returnDraftPageCount} perPage={perPage} onPageChange={setReturnDraftPage} onPerPageChange={value => { setPerPage(value); setReturnDraftPage(1); }} />
            </div>}

            {editorOpen && (<ValidatedForm as={motion.form} ref={editorRef} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} aria-busy={saving} inert={saving ? true : undefined} className="form-document form-frame scroll-mt-6 p-6">
                <FormEditorHeader title="Property Transfer Report" description={returnDraftItem ? `Select the new accountable officer, then click Transfer & Save. The PTR is saved automatically in Saved Records and removed from Drafts from PRS.` : 'Transfer an accountable asset to another custodian.'} onClose={() => { cancelEdit(); setEditorOpen(false); setSavedView('records'); scrollToRecords(); }} />
                {!editingId && !isUser && !returnDraftItem && <IarSourceSelect type="ptr" setForm={setForm} onSourceSelect={selectSourcePropertyRecord} onSourceClear={clearSourcePropertyRecord} accountabilities={assets} />}
                <fieldset disabled={workflow} className="min-w-0">
                <div className="grid gap-3 md:grid-cols-3">
                    {field('Entity Name', 'entityName')}
                    {returnDraftItem ? <label className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">Fund Cluster</span><input aria-label="Fund Cluster" readOnly value={form.fundCluster} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" /></label> : <FundClusterField value={form.fundCluster} onChange={(value) => update('fundCluster', value)} />}
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
                                    disabled={Boolean(returnDraftItem)}
                                    checked={form.transferTypeChoice === option}
                                    onChange={() => update('transferTypeChoice', option)}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                    {form.transferTypeChoice === 'Other' && (
                        <input required
                            readOnly={Boolean(returnDraftItem)}
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
                                <th className="p-2">Item Name <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Description <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Amount <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                                <th className="p-2">Condition of PPE <span className="required-marker text-red-600" aria-hidden="true">*</span></th>
                              <th className="w-12 p-2"><span className="sr-only">Row actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {form.items.map((item, index) => (
                                <tr key={index}>
                                    <td className="p-2">
                                        <input required={hasRowData(item, emptyItem())} aria-label="Date Acquired" type="date" value={item.dateAcquired || todayManila()} onChange={(e) => updateItem(index, 'dateAcquired', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        {isUser && !editingId ? <select required aria-label="Property to transfer" value={item.accountability || ''} onChange={event => { const asset = transferableAssets.find(row => row._id === event.target.value); const stockItem = asset?.inventory?.item; setForm(previous => ({ ...previous, items: [asset ? { accountability: asset._id, dateAcquired: toDateInputValue(asset.inventory?.purchaseDate) || todayManila(), propertyNumber: asset.propertyNumber || stockItem?.stockNumber || '', itemName: getIssuedItemName(asset), description: stockItem?.description || '', amount: asset.quantityRemaining * Number(asset.inventory?.unitCost || 0), condition: asset.condition || 'Serviceable' } : emptyItem()] })); }} className="w-full rounded-xl border p-2"><option value="">Select an issued item</option>{transferableAssets.map(asset => <option key={asset._id} value={asset._id}>{getIssuedItemName(asset)} - {asset.documentNumber}</option>)}</select> : <input required={hasRowData(item, emptyItem())} aria-label="Property Number" readOnly={Boolean(returnDraftItem)} value={item.propertyNumber} onChange={(e) => updateItem(index, 'propertyNumber', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />}
                                    </td>
                                    <td className="p-2">
                                        {!isUser && !editingId && !returnDraftItem ? <SearchInput required aria-label="Item Name" placeholder="Search an accountable item" value={item.itemName || ''} options={adminSourceItemOptions(index)} onChange={value => updateAdminSourceSearch(index, value)} onSelect={option => selectAdminSourceItem(index, option)} className="w-full rounded-xl border border-slate-200 px-2 py-2" /> : <input required={hasRowData(item, emptyItem())} readOnly={isUser || Boolean(returnDraftItem)} aria-label="Item Name" value={item.itemName} onChange={(e) => updateItem(index, 'itemName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />}
                                    </td>
                                    <td className="p-2">
                                        <input required={hasRowData(item, emptyItem())} readOnly={isUser || Boolean(returnDraftItem)} aria-label="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <input required={hasRowData(item, emptyItem())} readOnly={isUser || Boolean(returnDraftItem)} aria-label="Amount" type="number" min="0" step="any" value={item.amount} onChange={(e) => updateItem(index, 'amount', e.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2" />
                                    </td>
                                    <td className="p-2">
                                        <select required={hasRowData(item, emptyItem())} disabled={isUser || Boolean(returnDraftItem)} aria-label="Condition of PPE" value={item.condition} onChange={event => updateItem(index, 'condition', event.target.value)} className="w-full rounded-xl border border-slate-200 px-2 py-2"><option value="">Select condition</option>{item.condition && !['Serviceable', 'Unserviceable'].includes(item.condition) && <option value={item.condition}>{item.condition}</option>}<option value="Serviceable">Serviceable</option><option value="Unserviceable">Unserviceable</option></select>
                                    </td>
                                  <td className="p-2 text-center">{!returnDraftItem && <DeleteRowButton index={index} onClick={() => setForm(previous => { const items = previous.items.filter((_, rowIndex) => rowIndex !== index); return { ...previous, items: items.length ? items : [emptyItem()] }; })} />}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </TableScroll>
                {!isUser && !workflow && !returnDraftItem && <div className="mt-3 flex justify-end"><AddRowButton onClick={addItem} /></div>}

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Remarks (optional)</span>
                        <textarea readOnly={Boolean(returnDraftItem)} value={form.remarks} onChange={(e) => update('remarks', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Reason for Transfer</span>
                        <textarea required readOnly={Boolean(returnDraftItem)} value={form.reasonForTransfer} onChange={(e) => update('reasonForTransfer', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" rows={3} />
                    </label>
                </div>

                <fieldset disabled={Boolean(returnDraftItem)} className="mt-6 grid gap-4 md:grid-cols-2">
                    {signatoryFields('Approved By', 'approvedBy')}
                    {signatoryFields('Issued By', 'issuedBy')}
                    {signatoryFields('Received By', 'receivedBy')}
                </fieldset>

                </fieldset>
                {workflow && <p className="mt-4 text-sm">Status: {activeRecord.status.replaceAll('_', ' ')}{activeRecord.rejectionReason ? ` - ${activeRecord.rejectionReason}` : ''}</p>}
                {workflow && (isUser ? String(activeRecord.toUser) === String(user?._id) && activeRecord.status === 'PENDING_RECEIVER' : ['PENDING_RECEIVER', 'PENDING_ADMIN'].includes(activeRecord.status)) && <label className="mt-4 block">Decision<select value={decision} onChange={event => setDecision(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="confirm">{isUser ? 'Confirm physical receipt' : 'Approve transfer after receiver confirmation'}</option><option value="reject">Reject transfer</option></select></label>}
                {workflow && decision === 'reject' && <label className="mt-3 block">Reason for rejection<textarea required value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>}
                <div className="flex justify-end">
                  <button type="submit" disabled={saving || (workflow && !canProcess)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white">
                      <Send size={16} />
                      {workflow ? decision === 'reject' ? 'Reject PTR' : canProcess ? isUser ? 'Confirm Receipt' : 'Approve PTR' : 'Awaiting / Recorded Transfer' : returnDraftItem ? 'Transfer & Save' : 'Save'}
                  </button>
                </div>
            </ValidatedForm>)}
        </div>
    );
}
