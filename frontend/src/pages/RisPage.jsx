import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Save, RotateCcw, Trash2, CheckCircle2, XCircle, Send, ShieldCheck } from 'lucide-react';
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

export default function RisPage() {
  const [ris, setRis] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(initialForm);
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
  };

  const save = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
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
      await axios.post('/ris', payload);
      toast.success('RIS saved');
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

      <hr className="border-slate-300 border-2" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Create, approve, reject, and issue RIS records from the same workflow screen.</p>
          <p className="text-xs text-slate-400">Select stock numbers from the Property Card inventory to avoid issuance errors.</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <RotateCcw size={16} />
          Reset
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
                Submit RIS
              </button>
            </div>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
