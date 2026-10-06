import Skeleton from '../components/Skeleton';
import { PageSkeleton } from '../components/Skeleton';
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  FileText, ClipboardList, Users, UserRound, FileCheck2, ArrowLeftRight, RotateCcw, Archive, Clock,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Mirrors the sidebar's "Issue" submenu (Layout.jsx issueItems) â€” same labels, same icons.
const primaryCards = [
  { key: 'iar', title: 'Inspection & Acceptance Report', icon: FileCheck2, color: 'from-emerald-500 to-teal-600' },
  { key: 'propertyCards', title: 'Property Card', icon: ClipboardList, color: 'from-blue-500 to-cyan-600' },
  { key: 'ris', title: 'Requisition', icon: FileText, color: 'from-violet-500 to-fuchsia-600' },
  { key: 'ics', title: 'Inventory Custodian', icon: Archive, color: 'from-amber-500 to-orange-600' },
  { key: 'par', title: 'Property Acknowledgement Receipts', icon: FileText, color: 'from-sky-500 to-indigo-600' },
];

// Mirrors the sidebar's top-level items below "Issue" (Layout.jsx navItems) â€” same labels, same icons.
const secondaryCards = [
  { key: 'ptr', title: 'Property Transfer Report', icon: ArrowLeftRight, iconBg: 'bg-blue-50', iconColor: 'text-blue-700' },
  { key: 'prs', title: 'Property Return Slip', icon: RotateCcw, iconBg: 'bg-rose-50', iconColor: 'text-rose-700' },
  { key: 'returnedSupply', title: 'Returned Supply', icon: ClipboardList, iconBg: 'bg-amber-50', iconColor: 'text-amber-700' },
  { key: 'users', title: 'User Management', icon: Users, iconBg: 'bg-violet-50', iconColor: 'text-violet-700' },
];

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
    return {
      currentYear,
      currentYearReports,
    };
  }, [annualReportData]);

  const annualChartData = useMemo(() => {
    const examples = [{ year: '2024', reports: 6, example: true }, { year: '2025', reports: 9, example: true }];
    return [...annualReportData, ...examples.filter((example) => !annualReportData.some((entry) => entry.year === example.year))]
      .sort((first, second) => Number(first.year) - Number(second.year));
  }, [annualReportData]);

  if (loading) return <PageSkeleton dashboard />;
 return (
    <div className="dashboard-page space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="dashboard-issue">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Issue</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {primaryCards.map((card, index) => {
            const Icon = card.icon;
              return (
              <motion.div key={card.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="minimal-surface flex flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="dashboard-card-label text-sm leading-snug text-slate-500">{card.title}</div>
                  <div className={`shrink-0 rounded-md bg-gradient-to-br ${card.color} p-2.5 text-white`}><Icon size={20} /></div>
                </div>
                <div className="mt-4 text-3xl font-semibold text-slate-900">{loading ? <Skeleton className="h-4 w-20" /> : (counts?.[card.key] ?? 0)}</div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="dashboard-results grid items-stretch gap-4 xl:grid-cols-3">
        <div className="dashboard-charts grid gap-4 xl:col-span-2">
          <div className="dashboard-breakdowns grid h-fit items-start gap-4 sm:grid-cols-3">
            <div className="dashboard-return-summary minimal-surface h-fit p-4"><h2 className="text-sm font-semibold">Returned Slip</h2>{chartData.returnSlip.some(entry => entry.count > 0) ? <div className="dashboard-return-chart mt-2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData.returnSlip} dataKey="count" nameKey="label" outerRadius="65%" label>{chartData.returnSlip.map((entry, index) => <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div> : <p className="dashboard-return-empty mt-2 text-xs text-slate-500">No returns recorded yet.</p>}</div>
            <div className="dashboard-return-summary minimal-surface h-fit p-4"><h2 className="text-sm font-semibold">Returned Supply</h2>{chartData.returnedSupply.some(entry => entry.count > 0) ? <div className="dashboard-return-chart mt-2 h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData.returnedSupply} dataKey="count" nameKey="label" innerRadius="40%" outerRadius="65%" label>{chartData.returnedSupply.map((entry, index) => <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div> : <p className="dashboard-return-empty mt-2 text-xs text-slate-500">No returns recorded yet.</p>}</div>
            <div className="dashboard-users minimal-surface h-fit p-4">
              <h2 className="text-sm font-semibold">User Management</h2>
              <div className="dashboard-user-pictorial">
                {loading ? <Skeleton className="h-4 w-20" /> : chartData.users.length === 0 ? <p>No user records yet.</p> : [...chartData.users].sort((first, second) => {
                  const roleOrder = { admin: 0, user: 1 };
                  return (roleOrder[first.label.toLowerCase()] ?? 2) - (roleOrder[second.label.toLowerCase()] ?? 2);
                }).map((entry) => (
                  <div key={entry.label} className="user-pictorial-row" aria-label={`${entry.label}: ${entry.count} users`}>
                    <div className="user-pictorial-icons" aria-hidden="true">
                      <span className="user-pictorial-icon"><UserRound style={{ color: entry.label.toLowerCase() === 'admin' ? '#b49a5a' : '#2f6f68' }} /></span>
                    </div>
                    <div className="user-pictorial-heading"><span>{entry.label}</span><strong>{entry.count}</strong></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dashboard-reports grid gap-4 sm:grid-cols-2">
            <div className="dashboard-monthly minimal-surface p-4">
              <h2 className="text-sm font-semibold">Monthly Reports</h2>
              <p className="text-xs text-slate-500">Issued reports this year</p>
              <div className="monthly-report-chart mt-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyReportData} margin={{ top: 12, right: 12, bottom: 8, left: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="month" tick={{ fontSize: 9 }} height={26} minTickGap={8} padding={{ left: 6, right: 6 }} /><YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={28} /><Tooltip /><Line type="monotone" dataKey="reports" name="Reports" stroke="#2f6f68" strokeWidth={2} dot={{ r: 2 }} /></LineChart></ResponsiveContainer></div>
            </div>
            <div className="dashboard-annual minimal-surface p-4">
              <h2 className="text-sm font-semibold">Annual Reports</h2>
              <p className="text-xs text-slate-500">Issued reports by year{annualChartData.some((entry) => entry.example) ? " · Gold bars are examples" : ""}</p>
              <div className="annual-report-body">
                <div className="annual-bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={annualChartData} maxBarSize={56} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 9 }} height={22} /><YAxis allowDecimals={false} tick={{ fontSize: 9 }} width={24} /><Tooltip formatter={(value, name, item) => [value, item.payload.example ? "Example reports" : "Reports"]} /><Bar dataKey="reports" name="Reports" fill="#55c5cf" radius={[3, 3, 0, 0]}>{annualChartData.map((entry) => <Cell key={entry.year} fill={entry.example ? "#b49a5a" : "#55c5cf"} />)}</Bar></BarChart></ResponsiveContainer></div>
              </div>
              <div className="annual-report-summary">
                <span className="annual-report-year">{annualProgress.currentYear}</span>
                <span className="annual-report-summary-label">Total reports</span>
                <strong className="annual-report-count">{annualProgress.currentYearReports}</strong>
              </div>
            </div>
          </div>

        </div>

        <div className="dashboard-activity-column grid gap-4 xl:col-span-1">
          <div className="dashboard-activity dashboard-panel flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 font-semibold text-slate-800">{entry.action}</div>
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

      <div className="dashboard-other">
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Other Records</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryCards.map((card) => {
            if (card.key === 'users' && counts?.users == null) return null;
            const Icon = card.icon;
            return (
              <div key={card.key} className="minimal-surface flex items-start justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className={`shrink-0 rounded-md p-1.5 ${card.iconBg} ${card.iconColor}`}><Icon size={16} /></span>
                    <span className="dashboard-card-label text-xs font-semibold uppercase tracking-wide leading-snug">{card.title}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{loading ? <Skeleton className="h-4 w-20" /> : (counts?.[card.key] ?? 0)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}








