import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, ClipboardCheck, FileCheck2, ArrowLeftRight, RotateCcw, Users, LogOut, Menu, Archive, ChevronDown, ChevronRight, Settings, BarChart3, CalendarDays } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';

const issueItems = [
  { to: '/iar', label: 'Inspection & Acceptance Report', icon: FileCheck2, permissions: ['canViewIAR', 'canManageIAR'], adminOnly: true },
  { to: '/inventory', label: 'Property Card', icon: ClipboardList, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/ris', label: 'Requisition', icon: ClipboardCheck, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/inventory-custodian', label: 'Inventory Custodian', icon: Archive, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/par', label: 'Property Acknowledgement Receipts', icon: FileText, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/my-ris', label: 'My RIS', icon: ClipboardCheck, permissions: ['canViewRIS'], userOnly: true },
  { to: '/my-issued-items', label: 'My Issued Items', icon: Archive, permissions: ['canViewRIS'], userOnly: true },
];

const settingsItems = [
  { to: '/settings', label: 'System Settings', icon: Settings, permissions: ['canManageSettings'] },
  { to: '/users', label: 'User Management', icon: Users, permissions: ['canManageUsers'] },
];

const reportItems = [
  { to: '/reports/monthly', label: 'Monthly reports', icon: CalendarDays, permissions: ['canViewDashboard'] },
  { to: '/reports/annual', label: 'Annual Reports', icon: BarChart3, permissions: ['canViewDashboard'] },
];

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: ['canViewDashboard'] },
  { to: '__issue__', label: 'Issue', icon: FileText, permissions: [] },
  { to: '/transfers', label: 'Property Transfer Report', icon: ArrowLeftRight, permissions: ['canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '/returns', label: 'Property Return Slip', icon: RotateCcw, permissions: ['canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '/returned-supply', label: 'Returned Supply', icon: ClipboardList, permissions: ['canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '__reports__', label: 'Reports', icon: BarChart3, permissions: [] },
  { to: '__settings__', label: 'System Settings', icon: Settings, permissions: [] },
];

const canAccessNavItem = (user, item) => {
  if (user?.role === 'admin') return true;
  if (item.adminOnly || (item.userOnly && user?.role !== 'user')) return false;
  if (item.userOnly) return item.permissions?.some((permission) => user?.permissions?.includes(permission));
  if (item.to === '__issue__') return issueItems.some((childItem) => childItem.permissions.some((permission) => user?.permissions?.includes(permission)));
  if (item.to === '__reports__') return reportItems.some((childItem) => childItem.permissions.some((permission) => user?.permissions?.includes(permission)));
  if (item.to === '__settings__') return settingsItems.some((childItem) => childItem.permissions.some((permission) => user?.permissions?.includes(permission)));
  return item.permissions?.some((permission) => user?.permissions?.includes(permission));
};

export default function Layout() {
  const { user, logout } = useAuth();
  const [issueOpen, setIssueOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);

  return (
    <div className="app-shell flex h-screen overflow-hidden text-slate-900">
      <aside className="sidebar-shell hidden h-screen w-72 shrink-0 flex-col overflow-hidden p-4 text-white md:flex">
        <div className="sidebar-brand mb-6">
          <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="sidebar-brand__logo h-16 w-16 rounded-full object-cover" />
          <div className="min-w-0">
            <div className="text-lg font-bold tracking-wide">PAMS</div>
            <p className="mt-1 text-xs leading-relaxed text-white/65">Property Accountability Management System</p>
          </div>
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.filter((item) => canAccessNavItem(user, item)).map((item) => {
            if (item.to === '__issue__') {
              return (
                <div key={item.to} className="sidebar-nav-group pt-3">
                  <button
                    type="button"
                    onClick={() => setIssueOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <span className="flex items-center gap-3">
                      <FileText size={18} />
                      Issue
                    </span>
                    {issueOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  <AnimatePresence initial={false}>
                    {issueOpen ? (
                      <motion.div
                        key="issue-submenu"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 space-y-1 pl-3">
                          {issueItems.filter((childItem) => canAccessNavItem(user, childItem)).map((childItem) => {
                            const Icon = childItem.icon;
                            return (
                              <NavLink
                                key={childItem.to}
                                to={childItem.to}
                                className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-slate-500 hover:bg-white/70 hover:text-emerald-800'}`}
                              >
                                <Icon size={16} />
                                {childItem.label}
                              </NavLink>
                            );
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            }

            if (item.to === '__reports__') {
              return (
                <div key={item.to} className="sidebar-nav-group">
                  <button type="button" onClick={() => setReportsOpen((value) => !value)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                    <span className="flex items-center gap-3"><BarChart3 size={18} />Reports</span>
                    {reportsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <AnimatePresence initial={false}>
                    {reportsOpen ? (
                      <motion.div key="reports-submenu" initial={{ opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }} className="overflow-hidden">
                        <div className="mt-1 space-y-1 pl-3">
                          {reportItems.filter((childItem) => canAccessNavItem(user, childItem)).map((childItem) => {
                            const Icon = childItem.icon;
                            return <NavLink key={childItem.to} to={childItem.to} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-slate-500 hover:bg-white/70 hover:text-emerald-800'}`}><Icon size={16} />{childItem.label}</NavLink>;
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            }

            if (item.to === '__settings__') {
              return (
                <div key={item.to} className="sidebar-nav-group pt-3">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <span className="flex items-center gap-3"><Settings size={18} />Settings</span>
                    {settingsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <AnimatePresence initial={false}>
                    {settingsOpen ? (
                      <motion.div
                        key="settings-submenu"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1 space-y-1 pl-3">
                          {settingsItems.filter((childItem) => canAccessNavItem(user, childItem)).map((childItem) => {
                            const Icon = childItem.icon;
                            return <NavLink key={childItem.to} to={childItem.to} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-slate-500 hover:bg-white/70 hover:text-emerald-800'}`}><Icon size={16} />{childItem.label}</NavLink>;
                          })}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            }

            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-slate-500 hover:bg-white/70 hover:text-emerald-800'}`}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-user mt-auto rounded-xl p-3">
          <div className="truncate text-sm font-semibold">{user?.firstName} {user?.lastName}</div>
          <div className="truncate text-xs text-slate-500">{user?.office}</div>
          <button onClick={logout} className="mt-2 flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="title-bar border-b border-white/70 px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-slate-200 p-2 md:hidden"><Menu size={18} /></button>
              <div>
                <div className="text-base font-semibold tracking-tight text-slate-800">Property Accountability Management System of Supply Office of LGU Carigara</div>
                <div className="text-xs text-slate-500">Secure property custody tracking</div>
              </div>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
