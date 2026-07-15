import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

export default function IarPage() {
  const [iar, setIar] = useState([]);
  const [form, setForm] = useState({ iarNumber: 'IAR-001', poNumber: 'PO-001', supplier: '', invoiceNumber: 'INV-001', inspectionDate: new Date().toISOString().slice(0, 10), acceptanceDate: new Date().toISOString().slice(0, 10), purchaseDate: new Date().toISOString().slice(0, 10), receivedBy: 'R. Santos', inspectedBy: 'A. Cruz', acceptedBy: 'B. Reyes', items: [{ stockNumber: 'STK-1001', item: 'Laptop', description: 'Laptop', serialNumber: 'SN-001', propertyNumber: 'PROP-001', quantity: 1, unitCost: 45000, totalCost: 45000, acceptanceStatus: 'Accepted', remarks: '' }] });

  const load = async () => {
    const { data } = await axios.get('/iar');
    setIar(data.data || []);
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    await axios.post('/iar', form);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Inspection & Acceptance Report</h1>
        <p className="text-sm text-slate-500">Record accepted items and automatically generate inventory records.</p>
      </div>
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">IAR Number</span>
            <input id="iar-number" required value={form.iarNumber} onChange={(e) => setForm({ ...form, iarNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="IAR Number" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">PO Number</span>
            <input id="iar-po" required value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="PO Number" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Supplier</span>
            <input id="iar-supplier" required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Supplier" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Invoice Number</span>
            <input id="iar-invoice" required value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Invoice Number" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Inspection Date</span>
            <input id="iar-inspection-date" type="date" required value={form.inspectionDate} onChange={(e) => setForm({ ...form, inspectionDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Acceptance Date</span>
            <input id="iar-acceptance-date" type="date" required value={form.acceptanceDate} onChange={(e) => setForm({ ...form, acceptanceDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Purchase Date</span>
            <input id="iar-purchase-date" type="date" required value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Received By</span>
            <input id="iar-received-by" required value={form.receivedBy} onChange={(e) => setForm({ ...form, receivedBy: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Received By" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Inspected By</span>
            <input id="iar-inspected-by" required value={form.inspectedBy} onChange={(e) => setForm({ ...form, inspectedBy: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Inspected By" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Accepted By</span>
            <input id="iar-accepted-by" required value={form.acceptedBy} onChange={(e) => setForm({ ...form, acceptedBy: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Accepted By" />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left"><th className="p-2">Stock Number</th><th className="p-2">Item</th><th className="p-2">Qty</th><th className="p-2">Unit Cost</th><th className="p-2">Total Cost</th></tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => (
                <tr key={index}>
                  <td className="p-2"><input aria-label="Stock Number" value={item.stockNumber} onChange={(e) => { const items = [...form.items]; items[index].stockNumber = e.target.value; setForm({ ...form, items }); }} className="w-full rounded-xl border border-slate-200 px-2 py-2" /></td>
                  <td className="p-2"><input aria-label="Item" value={item.item} onChange={(e) => { const items = [...form.items]; items[index].item = e.target.value; setForm({ ...form, items }); }} className="w-full rounded-xl border border-slate-200 px-2 py-2" /></td>
                  <td className="p-2"><input aria-label="Quantity" type="number" value={item.quantity} onChange={(e) => { const items = [...form.items]; items[index].quantity = Number(e.target.value); items[index].totalCost = Number(e.target.value) * Number(items[index].unitCost); setForm({ ...form, items }); }} className="w-full rounded-xl border border-slate-200 px-2 py-2" /></td>
                  <td className="p-2"><input aria-label="Unit Cost" type="number" value={item.unitCost} onChange={(e) => { const items = [...form.items]; items[index].unitCost = Number(e.target.value); items[index].totalCost = Number(items[index].quantity || 0) * Number(e.target.value); setForm({ ...form, items }); }} className="w-full rounded-xl border border-slate-200 px-2 py-2" /></td>
                  <td className="p-2"><input aria-label="Total Cost" value={item.totalCost} readOnly className="w-full rounded-xl border border-slate-200 px-2 py-2" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-white">Save IAR</button>
      </motion.form>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Accepted Reports</h2>
        <div className="mt-4 space-y-3">
          {iar.map((item) => (
            <div key={item._id} className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold">{item.iarNumber}</div>
              <div className="text-sm text-slate-500">Supplier: {item.supplier?.name || item.supplier}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
