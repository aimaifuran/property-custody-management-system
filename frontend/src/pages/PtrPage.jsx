import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function PtrPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.permissions?.includes('canManageInventory');
  const [reports, setReports] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [form, setForm] = useState({
    ptrNumber: '',
    inventory: '',
    oldAccountableOfficer: '',
    newAccountableOfficer: '',
    transferDate: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  const load = async () => {
    const [ptrRes, invRes] = await Promise.all([axios.get('/ptr'), axios.get('/inventory')]);
    setReports(ptrRes.data.data || []);
    setInventories(invRes.data.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const availableInventories = useMemo(() => inventories.filter((entry) => !entry.deleted), [inventories]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/ptr', form);
      toast.success('PTR created');
      setForm({
        ptrNumber: '',
        inventory: '',
        oldAccountableOfficer: '',
        newAccountableOfficer: '',
        transferDate: new Date().toISOString().slice(0, 10),
        reason: '',
      });
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to create PTR');
    }
  };

  const approve = async (id) => {
    try {
      await axios.post(`/ptr/${id}/approve`);
      toast.success('PTR approved');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to approve PTR');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Property Transfer Report</h1>
        <p className="text-sm text-slate-500">Transfer an accountable asset to another custodian.</p>
      </div>

      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">PTR Number</span>
            <input value={form.ptrNumber} onChange={(e) => setForm({ ...form, ptrNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="PTR-001" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Transfer Date</span>
            <input type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Inventory</span>
            <select value={form.inventory} onChange={(e) => setForm({ ...form, inventory: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Select inventory</option>
              {availableInventories.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  {entry.item?.stockNumber} - {entry.item?.description} - {entry.status}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Old Accountable Officer</span>
            <input value={form.oldAccountableOfficer} onChange={(e) => setForm({ ...form, oldAccountableOfficer: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Current custodian" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">New Accountable Officer</span>
            <input value={form.newAccountableOfficer} onChange={(e) => setForm({ ...form, newAccountableOfficer: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="New custodian" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Reason</span>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Transfer reason" />
          </label>
        </div>
        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white">
          <Send size={16} />
          Create PTR
        </button>
      </motion.form>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">PTR Queue</h2>
        <div className="mt-4 space-y-3">
          {reports.map((item) => (
            <div key={item._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{item.ptrNumber}</div>
                  <div className="text-sm text-slate-500">{item.oldAccountableOfficer} {'->'} {item.newAccountableOfficer}</div>
                  <div className="text-sm text-slate-500">{item.reason}</div>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</div>
              </div>
              {canManage && item.status === 'PENDING_TRANSFER' ? (
                <button type="button" onClick={() => approve(item._id)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                  <CheckCircle2 size={16} />
                  Approve Transfer
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
