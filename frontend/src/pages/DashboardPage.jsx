import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  FileText, ClipboardList, Users, FileCheck2, ArrowLeftRight, RotateCcw, Archive, Clock,
} from 'lucide-react';

// Mirrors the sidebar's "Issue" submenu (Layout.jsx issueItems) — same labels, same icons.
const primaryCards = [
  { key: 'iar', title: 'Inspection & Acceptance Report', icon: FileCheck2, color: 'from-emerald-500 to-teal-600' },
  { key: 'propertyCards', title: 'Property Card', icon: ClipboardList, color: 'from-blue-500 to-cyan-600' },
  { key: 'ris', title: 'Requisition', icon: FileText, color: 'from-violet-500 to-fuchsia-600' },
  { key: 'ics', title: 'Inventory Custodian', icon: Archive, color: 'from-amber-500 to-orange-600' },
  { key: 'par', title: 'Property Acknowledgement Receipts', icon: FileText, color: 'from-sky-500 to-indigo-600' },
];

// Mirrors the sidebar's top-level items below "Issue" (Layout.jsx navItems) — same labels, same icons.
const secondaryCards = [
  { key: 'ptr', title: 'Property Transfer Report', icon: ArrowLeftRight },
  { key: 'prs', title: 'Property Return Slip', icon: RotateCcw },
  { key: 'returnedSupply', title: 'Returned Supply', icon: ClipboardList },
  { key: 'users', title: 'User Management', icon: Users },
];

const STATUS_STYLES = {
  LOGGED_TO_STOCKS: { label: 'Logged to Stocks', tone: 'good' },
  IN_STORAGE: { label: 'In Storage', tone: 'good' },
  IN_STORAGE_AVAILABLE: { label: 'In Storage (Available)', tone: 'good' },
  ACTIVE_IN_USE: { label: 'Active in Use', tone: 'good' },
  ISSUED: { label: 'Issued', tone: 'warning' },
  TRANSFERRED: { label: 'Transferred', tone: 'warning' },
  RETURNED: { label: 'Returned', tone: 'warning' },
  UNSERVICEABLE: { label: 'Unserviceable', tone: 'critical' },
  RETURNED_UNSERVICEABLE: { label: 'Returned Unserviceable', tone: 'critical' },
  IN_STORAGE_UNSERVICEABLE: { label: 'In Storage (Unserviceable)', tone: 'critical' },
};

const TONE_DOT = {
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-rose-500',
};

const formatRelativeTime = (dateStr) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
};

const formatUserName = (user) => {
  if (!user) return 'System';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || 'System';
};

export default function DashboardPage() {
  const [counts, setCounts] = useState(null);
  const [inventoryStatus, setInventoryStatus] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get('/reports/summary');
        setCounts(data.data.counts);
        setInventoryStatus(data.data.inventoryStatus || []);
        setRecentActivity(data.data.recentActivity || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalInventory = inventoryStatus.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">Monitor property custody activity and inventory health.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Issue</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {primaryCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className={`flex flex-col justify-between rounded-2xl bg-gradient-to-br ${card.color} p-5 text-white`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm leading-snug opacity-90">{card.title}</div>
                  <div className="shrink-0 rounded-2xl bg-white/20 p-3"><Icon size={22} /></div>
                </div>
                <div className="mt-4 text-3xl font-semibold">{loading ? '—' : (counts?.[card.key] ?? 0)}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Other Records</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryCards.map((card) => {
            if (card.key === 'users' && counts?.users == null) return null;
            const Icon = card.icon;
            return (
              <div key={card.key} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon size={18} />
                    <span className="text-xs font-semibold uppercase tracking-wide leading-snug">{card.title}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{loading ? '—' : (counts?.[card.key] ?? 0)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Activity</h2>
            <Clock size={18} className="text-slate-400" />
          </div>
          <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
            {!loading && recentActivity.length === 0 && (
              <p className="text-sm text-slate-500">No recent activity recorded yet.</p>
            )}
            {recentActivity.map((entry) => (
              <div key={entry._id} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-800">{entry.action}</div>
                  <div className="whitespace-nowrap text-xs text-slate-400">{formatRelativeTime(entry.createdAt)}</div>
                </div>
                {entry.details && <div className="mt-1 text-sm text-slate-500">{entry.details}</div>}
                <div className="mt-1 text-xs text-slate-400">by {formatUserName(entry.user)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Inventory Status</h2>
            <span className="text-sm text-slate-400">{totalInventory} total</span>
          </div>
          <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
            {!loading && inventoryStatus.length === 0 && (
              <p className="text-sm text-slate-500">No inventory records yet.</p>
            )}
            {inventoryStatus.map((entry) => {
              const meta = STATUS_STYLES[entry.status] || { label: entry.status || 'Unknown', tone: 'warning' };
              return (
                <div key={entry.status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[meta.tone]}`} />
                    {meta.label}
                  </div>
                  <div className="font-semibold">{entry.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
