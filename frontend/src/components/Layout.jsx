import axios from 'axios';
import toast from 'react-hot-toast';
import { useRef } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, ClipboardCheck, FileCheck2, ArrowLeftRight, RotateCcw, Users, LogOut, Menu, Archive, ChevronDown, ChevronRight, BarChart3, CalendarDays, History } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { preloadFormFonts } from '../utils/formPdfFonts';

const issueItems = [
  { to: '/iar', label: 'Inspection and Acceptance Report', icon: FileCheck2, permissions: ['canViewIAR', 'canManageIAR'], adminOnly: true },
  { to: '/inventory', label: 'Property Card', icon: ClipboardList, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/ris', label: 'Requisition and Issue Slip', icon: ClipboardCheck, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/inventory-custodian', label: 'Inventory Custodian Slip', icon: Archive, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
  { to: '/par', label: 'Property Acknowledgement Receipt', icon: FileText, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'], adminOnly: true },
];

const reportItems = [
  { to: '/reports/ppe-list', label: 'List of PPEs', icon: ClipboardList, permissions: ['canViewDashboard'] },
  { to: '/reports/monthly', label: 'Monthly Reports', icon: CalendarDays, permissions: ['canViewDashboard'] },
  { to: '/reports/annual', label: 'Annual Reports', icon: BarChart3, permissions: ['canViewDashboard'] },
  { to: '/historical-records', label: 'Historical Records', icon: History, permissions: [], adminOnly: true },
];

const navItems = [
  { to: '/my-issued-items', label: 'Issued Items', icon: Archive, permissions: ['canViewRIS'], userOnly: true },
  { to: '/my-returns', label: 'Returned Items', icon: RotateCcw, permissions: ['canViewRIS'], userOnly: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: ['canViewDashboard'] },
  { to: '__issue__', label: 'Issue', icon: FileText, permissions: [] },
  { to: '/transfers', label: 'Property Transfer Report', icon: ArrowLeftRight, permissions: ['canViewRIS', 'canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '/returns', label: 'Property Return Slip', icon: RotateCcw, permissions: ['canViewRIS', 'canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '/returned-supply', label: 'Returned Supply', icon: ClipboardList, permissions: ['canViewDashboard', 'canManageInventory'], adminOnly: true },
  { to: '__reports__', label: 'Reports', icon: BarChart3, permissions: [] },
  { to: '/users', label: 'User Management', icon: Users, permissions: ['canManageUsers'] },
  { to: '/profile', label: 'My Profile', icon: Users, permissions: [], adminOnly: true },
];

const canAccessNavItem = (user, item) => {
  if (item.userOnly) return user?.role === 'user' && item.permissions?.some((permission) => user?.permissions?.includes(permission));
  if (user?.role === 'admin') return true;
  if (item.adminOnly) return false;
  if (item.to === '__issue__') return issueItems.some(childItem => canAccessNavItem(user, childItem));
  return false;
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [pendingResets, setPendingResets] = useState(0);
  const notifiedResets = useRef(new Set());

  useEffect(() => {
    const warmFonts = () => { preloadFormFonts(['regular', 'bold']).catch(() => {}); };
    if (window.requestIdleCallback) {
      const task = window.requestIdleCallback(warmFonts, { timeout: 1000 });
      return () => window.cancelIdleCallback(task);
    }
    const timer = window.setTimeout(warmFonts, 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return undefined;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const { data } = await axios.get('/users/password-reset-requests', { signal: controller.signal });
        const pending = data.data.filter(request => request.status === 'PENDING');
        setPendingResets(pending.length);
        pending.forEach(request => {
          if (!notifiedResets.current.has(request._id)) {
            notifiedResets.current.add(request._id);
            toast(`Password reset requested by ${request.user.username}. Review in User Management.`, { id: `reset-${request._id}`, duration: 6000 });
          }
        });
      } catch { /* Retry on focus or the next refresh. */ }
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('password-recovery-updated', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('password-recovery-updated', refresh); };
  }, [user?._id, user?.role]);
  const [issueOpen, setIssueOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMobileSidebarOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen]);

  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  return (
    <div className="app-shell flex h-screen overflow-hidden text-slate-900">
      <AnimatePresence>
        {mobileSidebarOpen ? (
          <motion.button
            type="button"
            key="sidebar-backdrop"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
            onClick={closeMobileSidebar}
          />
        ) : null}
      </AnimatePresence>
      <aside
        id="app-sidebar"
        className={`sidebar-shell fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[min(100vw,20rem)] shrink-0 flex-col overflow-hidden p-4 text-white shadow-xl transition-transform duration-300 ease-out md:static md:z-auto md:max-w-none md:translate-x-0 md:shadow-none ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className="sidebar-brand mb-6">
          <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="sidebar-brand__logo h-16 w-16 rounded-full object-cover" />
          <div className="min-w-0">
            <div className="sidebar-brand__title text-lg font-bold tracking-wide">PAMS</div>
            <p className="mt-1 text-xs leading-relaxed text-white/65">Property Accountability Management System</p>
          </div>
        </div>
        <div className="sidebar-section-label">Workspace</div>
        <div className="sidebar-nav min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-1">
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

            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-slate-500 hover:bg-white/70 hover:text-emerald-800'}`}>
                <Icon size={18} />
                {item.to === '/custody' ? user?.role === 'admin' ? 'Workflow Approvals (PTR / PRS)' : 'My ICS / PAR · PTR / PRS' : item.label}
                {item.to === '/users' && pendingResets > 0 && <span aria-label={`${pendingResets} password reset requests awaiting approval`} className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">{pendingResets}</span>}
              </NavLink>
            );
          })}
        </nav>
        </div>
        <div className="sidebar-user mt-2 shrink-0 rounded-xl p-2">
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
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                className="title-bar__menu-btn rounded-xl border border-white/50 p-2 text-white md:hidden"
                aria-expanded={mobileSidebarOpen}
                aria-controls="app-sidebar"
                aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={() => setMobileSidebarOpen((open) => !open)}
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                <div className="title-bar__title text-sm font-semibold leading-snug tracking-tight text-slate-800 sm:text-base">Property Accountability Management System of Supply Office of LGU Carigara</div>
                <div className="text-xs text-slate-500">Secure property custody tracking</div>
              </div>
            </div>
            <div className="ml-2 shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
          </div>
        </header>
        <main className={`min-h-0 flex-1 overflow-y-auto p-6 ${location.pathname === '/dashboard' ? 'dashboard-main' : ''}`}>
          <motion.div className={location.pathname === '/dashboard' ? 'dashboard-container' : undefined} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
