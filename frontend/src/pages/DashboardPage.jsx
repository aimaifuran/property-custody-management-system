import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Package2, FileText, ClipboardList, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const statCards = [
  { key: 'suppliers', title: 'Suppliers', icon: Package2, color: 'from-emerald-500 to-teal-600' },
  { key: 'ris', title: 'RIS', icon: FileText, color: 'from-blue-500 to-cyan-600' },
  { key: 'iar', title: 'IAR', icon: ClipboardList, color: 'from-violet-500 to-fuchsia-600' },
  { key: 'users', title: 'Users', icon: Users, color: 'from-amber-500 to-orange-600' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState({ suppliers: 0, ris: 0, iar: 0, users: 0, inventory: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [suppliers, ris, iar, users, inventory] = await Promise.all([
          axios.get('/suppliers'),
          axios.get('/ris'),
          axios.get('/iar'),
          axios.get('/users'),
          axios.get('/inventory'),
        ]);
        setStats({
          suppliers: suppliers.data.data?.length || 0,
          ris: ris.data.data?.length || 0,
          iar: iar.data.data?.length || 0,
          users: users.data.data?.length || 0,
          inventory: inventory.data.data?.length || 0,
        });
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">Monitor property custody activity and inventory health.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`rounded-2xl bg-gradient-to-br ${card.color} p-5 text-white`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm opacity-80">{card.title}</div>
                  <div className="mt-2 text-3xl font-semibold">{loading ? '—' : stats[card.key]}</div>
                </div>
                <div className="rounded-2xl bg-white/20 p-3"><Icon size={24} /></div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <ArrowUpRight size={16} /> Active records
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Activity</h2>
            <span className="text-sm text-slate-400">Live overview</span>
          </div>
          <div className="mt-4 space-y-3">
            {['RIS submitted', 'Inventory received', 'Transfer completed'].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>{item}</div>
                <div className="text-sm text-slate-500">Today</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Inventory Status</h2>
            <span className="text-sm text-slate-400">Snapshot</span>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2"><ArrowDownRight size={16} className="text-amber-500" /> Low stock</div>
              <div className="font-semibold">4 items</div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2"><ArrowUpRight size={16} className="text-emerald-500" /> In stock</div>
              <div className="font-semibold">{stats.inventory}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
