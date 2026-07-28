import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', address: '', contactNumber: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/suppliers');
      setSuppliers(data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/suppliers', form);
      setForm({ name: '', address: '', contactNumber: '' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Suppliers</h1>
          <p className="text-sm text-slate-500">Manage approved suppliers and vendor contact details.</p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-white"><Plus size={18} /> New supplier</button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search size={16} className="text-slate-400" />
            <label htmlFor="supplier-search" className="sr-only">Search suppliers</label>
            <input id="supplier-search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full outline-none" placeholder="Search suppliers" />
          </div>
          {loading ? (
            <SkeletonList count={4} />
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 && <p className="text-sm text-slate-500">No suppliers found.</p>}
              {filtered.map((supplier) => (
                <div key={supplier._id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{supplier.name}</div>
                      <div className="text-sm text-slate-500">{supplier.address}</div>
                    </div>
                    <div className="text-sm text-slate-500">{supplier.contactNumber}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
        <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add Supplier</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Name</span>
              <input id="supplier-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Address</span>
              <input id="supplier-address" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Address" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Contact Number</span>
              <input id="supplier-contact" required value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Contact Number" />
            </label>
            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {saving && <Spinner size={16} />}
              {saving ? 'Saving…' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
