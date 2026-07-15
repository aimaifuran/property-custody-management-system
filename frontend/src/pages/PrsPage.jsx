import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function PrsPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.permissions?.includes('canManageInventory');
  const [reports, setReports] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [form, setForm] = useState({
    prsNumber: '',
    accountability: '',
    returnDate: new Date().toISOString().slice(0, 10),
    condition: '',
    serviceable: true,
    remarks: '',
  });

  const load = async () => {
    const [prsRes, invRes] = await Promise.all([axios.get('/prs'), axios.get('/inventory')]);
    setReports(prsRes.data.data || []);
    setInventories(invRes.data.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const activeInventories = useMemo(
    () => inventories.filter((entry) => entry.accountability),
    [inventories],
  );

  const save = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/prs', form);
      toast.success('PRS created');
      setForm({
        prsNumber: '',
        accountability: '',
        returnDate: new Date().toISOString().slice(0, 10),
        condition: '',
        serviceable: true,
        remarks: '',
      });
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to create PRS');
    }
  };

  const accept = async (id) => {
    try {
      await axios.post(`/prs/${id}/accept`);
      toast.success('PRS accepted');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to accept PRS');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Property Return Slip</h1>
        <p className="text-sm text-slate-500">Return an accountable asset to storage or mark it unserviceable.</p>
      </div>

      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">PRS Number</span>
            <input value={form.prsNumber} onChange={(e) => setForm({ ...form, prsNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="PRS-001" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Return Date</span>
            <input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Accountability</span>
            <select value={form.accountability} onChange={(e) => setForm({ ...form, accountability: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Select active accountability</option>
              {activeInventories.map((entry) => (
                <option key={entry.accountability._id} value={entry.accountability._id}>
                  {entry.item?.stockNumber} - {entry.item?.description} - {entry.accountability.employee}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Condition</span>
            <input value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Condition on return" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Serviceable</span>
            <select value={String(form.serviceable)} onChange={(e) => setForm({ ...form, serviceable: e.target.value === 'true' })} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Remarks</span>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Optional remarks" />
          </label>
        </div>
        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white">
          <RotateCcw size={16} />
          Create PRS
        </button>
      </motion.form>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">PRS Queue</h2>
        <div className="mt-4 space-y-3">
          {reports.map((item) => (
            <div key={item._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{item.prsNumber}</div>
                  <div className="text-sm text-slate-500">{item.condition}</div>
                  <div className="text-sm text-slate-500">{item.serviceable ? 'Serviceable' : 'Unserviceable'}</div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</div>
              </div>
              {canManage && item.status === 'PENDING_RETURN' ? (
                <button type="button" onClick={() => accept(item._id)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  <CheckCircle2 size={16} />
                  Accept Return
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
