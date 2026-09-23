import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  FileText, ClipboardList, Users, FileCheck2, ArrowLeftRight, RotateCcw, Archive, Clock,
} from 'lucide-react';
import { AreaChart, BarChart, Bar, CartesianGrid, Cell, Line, LineChart, PieChart, Pie, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  { key: 'ptr', title: 'Property Transfer Report', icon: ArrowLeftRight, iconBg: 'bg-blue-50', iconColor: 'text-blue-700' },
  { key: 'prs', title: 'Property Return Slip', icon: RotateCcw, iconBg: 'bg-rose-50', iconColor: 'text-rose-700' },
  { key: 'returnedSupply', title: 'Returned Supply', icon: ClipboardList, iconBg: 'bg-amber-50', iconColor: 'text-amber-700' },
  { key: 'users', title: 'User Management', icon: Users, iconBg: 'bg-violet-50', iconColor: 'text-violet-700' },
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

const CHART_COLORS = ['#2f6f68', '#b49a5a', '#7b8fa8', '#a86f78', '#6f7d62', '#c58b5c'];
const REPORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [chartData, setChartData] = useState({ returnSlip: [], returnedSupply: [], users: [] });
  const [issuedReports, setIssuedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data }, { data: issuedData }] = await Promise.all([
          axios.get('/reports/summary'),
          axios.get('/reports/issued'),
        ]);
        setCounts(data.data.counts);
        setInventoryStatus(data.data.inventoryStatus || []);
        setRecentActivity(data.data.recentActivity || []);
        setIssuedReports(issuedData.data || []);
        setChartData({
          returnSlip: data.data.returnSlipBreakdown || [],
          returnedSupply: data.data.returnedSupplyBreakdown || [],
          users: data.data.userBreakdown || [],
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalInventory = inventoryStatus.reduce((sum, entry) => sum + entry.count, 0);
  const monthlyReportData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const countsByMonth = Array(12).fill(0);
    issuedReports.forEach((report) => {
      const date = new Date(report.reportDate);
      if (date.getFullYear() === currentYear && date.getMonth() >= 0) countsByMonth[date.getMonth()] += 1;
    });
    return REPORT_MONTHS.map((month, index) => ({ month, reports: countsByMonth[index] }));
  }, [issuedReports]);

  const annualReportData = useMemo(() => {
    const countsByYear = {};
    issuedReports.forEach((report) => {
      const year = new Date(report.reportDate).getFullYear();
      if (Number.isFinite(year)) countsByYear[year] = (countsByYear[year] || 0) + 1;
    });
    return Object.keys(countsByYear).sort().map((year) => ({ year, reports: countsByYear[year] }));
  }, [issuedReports]);

  const annualProgress = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentYearReports = annualReportData.find((entry) => Number(entry.year) === currentYear)?.reports || 0;
    const highestAnnualTotal = Math.max(1, ...annualReportData.map((entry) => entry.reports));
    return {
      currentYear,
      currentYearReports,
      percentage: Math.round((currentYearReports / highestAnnualTotal) * 100),
    };
  }, [annualReportData]);

  const annualHighlights = useMemo(() => annualReportData.slice(-2).reverse(), [annualReportData]);

  return (
    <div className="dashboard-page space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Issue</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {primaryCards.map((card, index) => {
            const Icon = card.icon;
              return (
              <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="minimal-surface flex flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm leading-snug text-slate-500">{card.title}</div>
                  <div className={`shrink-0 rounded-md bg-gradient-to-br ${card.color} p-2.5 text-white`}><Icon size={20} /></div>
                </div>
                <div className="mt-4 text-3xl font-semibold text-slate-900">{loading ? '—' : (counts?.[card.key] ?? 0)}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          <div className="grid h-fit items-start gap-4 sm:grid-cols-3">
            <div className="minimal-surface h-fit p-4"><h2 className="text-sm font-semibold">Returned Slip</h2><div className="mt-2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData.returnSlip} dataKey="count" nameKey="label" outerRadius={58} label>{chartData.returnSlip.map((entry, index) => <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
            <div className="minimal-surface h-fit p-4"><h2 className="text-sm font-semibold">User Management</h2><div className="mt-2 h-40"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData.users}><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" radius={[2, 2, 0, 0]}>{chartData.users.map((entry, index) => <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
            <div className="minimal-surface h-fit p-4"><h2 className="text-sm font-semibold">Returned Supply</h2><div className="mt-2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData.returnedSupply} dataKey="count" nameKey="label" innerRadius={38} outerRadius={58} label>{chartData.returnedSupply.map((entry, index) => <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="minimal-surface p-4">
              <h2 className="text-sm font-semibold">Monthly Reports</h2>
              <p className="text-xs text-slate-500">Issued reports this year</p>
              <div className="mt-2 h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyReportData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="reports" name="Reports" stroke="#2f6f68" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
            </div>
            <div className="minimal-surface p-4">
              <h2 className="text-sm font-semibold">Annual Reports</h2>
              <p className="text-xs text-slate-500">Yearly report progress</p>
              <div className="mt-2 grid items-center gap-3 sm:grid-cols-[minmax(130px,0.9fr)_1fr]">
                <div className="relative h-44"><ResponsiveContainer width="100%" height="100%"><RadialBarChart cx="50%" cy="50%" innerRadius="62%" outerRadius="82%" barSize={16} startAngle={90} endAngle={-270} data={[{ name: 'Annual reports', value: annualProgress.percentage, fill: '#55c5cf' }]}><PolarAngleAxis type="number" domain={[0, 100]} tick={false} /><RadialBar background={{ fill: '#edf1ed' }} cornerRadius={10} dataKey="value" /></RadialBarChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div className="text-2xl font-semibold text-slate-900">{annualProgress.percentage}%</div><div className="text-xs text-slate-500">progress</div></div></div>
                <div className="space-y-3">
                  <div><div className="text-xs text-slate-500">{annualProgress.currentYear} reports</div><div className="text-2xl font-semibold text-slate-900">{annualProgress.currentYearReports}</div></div>
                  <div><div className="text-xs text-slate-500">All recorded reports</div><div className="text-2xl font-semibold text-slate-900">{issuedReports.length}</div></div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {annualHighlights.map((entry, index) => <div key={entry.year} className="rounded-lg border border-slate-100 bg-slate-50 p-2"><div className={`mb-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{entry.year}</div><div className="text-lg font-semibold text-slate-900">{entry.reports}</div><div className="text-[10px] text-slate-500">Total reports</div></div>)}
                {annualHighlights.length === 0 && <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500">No annual report records yet.</div>}
              </div>
            </div>
          </div>

          <div className="dashboard-panel rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Inventory Status</h2>
              <span className="text-sm text-slate-400">{totalInventory} total</span>
            </div>
            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
              {!loading && inventoryStatus.length === 0 && (
                <p className="text-sm text-slate-500">No inventory records yet.</p>
              )}
              {inventoryStatus.map((entry) => {
                const meta = STATUS_STYLES[entry.status] || { label: entry.status || 'Unknown', tone: 'warning' };
                return (
                  <div key={entry.status} className="dashboard-row flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
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

        <div className="grid gap-4 xl:col-span-1">
          <div className="dashboard-panel flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent Activity</h2>
              <div className="rounded-md bg-sky-50 p-1.5 text-sky-700"><Clock size={18} /></div>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {!loading && recentActivity.length === 0 && (
                <p className="text-sm text-slate-500">No recent activity recorded yet.</p>
              )}
              {recentActivity.map((entry) => (
                <div key={entry._id} className="dashboard-row rounded-xl bg-slate-50 px-4 py-3">
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

        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Other Records</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryCards.map((card) => {
            if (card.key === 'users' && counts?.users == null) return null;
            const Icon = card.icon;
            return (
              <div key={card.key} className="minimal-surface flex items-start justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className={`rounded-md p-1.5 ${card.iconBg} ${card.iconColor}`}><Icon size={16} /></span>
                    <span className="text-xs font-semibold uppercase tracking-wide leading-snug">{card.title}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{loading ? '—' : (counts?.[card.key] ?? 0)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
