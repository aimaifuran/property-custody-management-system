import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, FileCheck2, ArrowLeftRight, RotateCcw, Users, LogOut, Menu, Archive, ChevronDown, ChevronRight, UserCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import ThreeBodyLoader from './ThreeBodyLoader';

const issueItems = [
  { to: '/iar', label: 'Inspection & Acceptance Report', icon: FileCheck2, permissions: ['canViewIAR'] },
  { to: '/inventory', label: 'Property Card', icon: ClipboardList, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'] },
  { to: '/ris', label: 'Requisition', icon: FileText, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'] },
  { to: '/inventory-custodian', label: 'Inventory Custodian', icon: Archive, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'] },
  { to: '/par', label: 'Property Acknowledgement Receipts', icon: FileText, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'] },
];

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: ['canViewDashboard'] },
  { to: '__issue__', label: 'Issue', icon: FileText, permissions: [] },
  { to: '/transfers', label: 'Property Transfer Report', icon: ArrowLeftRight, permissions: ['canViewDashboard'] },
  { to: '/returns', label: 'Property Return Slip', icon: RotateCcw, permissions: ['canViewDashboard'] },
  { to: '/returned-supply', label: 'Returned Supply', icon: ClipboardList, permissions: ['canViewDashboard'] },
  { to: '/users', label: 'User Management', icon: Users, permissions: ['canManageUsers'] },
];

const canAccessNavItem = (user, item) => (
  user?.role === 'admin' || item.permissions?.some((permission) => user?.permissions?.includes(permission))
);

export default function Layout() {
  const { user, logout, loggingOut } = useAuth();
  const [issueOpen, setIssueOpen] = useState(true);

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900">
      {loggingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <ThreeBodyLoader text="Signing out…" color="#2dd4bf" textClassName="text-slate-100" />
        </div>
      )}
      <aside className="hidden md:flex min-h-screen w-72 flex-col border-r border-slate-200 bg-slate-950 p-6 text-slate-100">
        <div className="mb-8">
          <div className="text-2xl font-semibold">PAIS</div>
          <p className="text-sm text-slate-400">Property Accountability Information System</p>
        </div>
        <nav className="space-y-2">
          {navItems.filter((item) => canAccessNavItem(user, item)).map((item) => {
            if (item.to === '__issue__') {
              return (
                <div key={item.to} className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIssueOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
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
                        <div className="mt-2 space-y-1 pl-4">
                          {issueItems.filter((childItem) => canAccessNavItem(user, childItem)).map((childItem) => {
                            const Icon = childItem.icon;
                            return (
                              <NavLink
                                key={childItem.to}
                                to={childItem.to}
                                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
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

            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="font-semibold">{user?.firstName} {user?.lastName}</div>
          <div className="text-sm text-slate-400">{user?.office}</div>
          <NavLink to="/profile" className={({ isActive }) => `mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-teal-600 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}>
            <UserCircle size={16} /> My Profile
          </NavLink>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="mt-2 flex w-full items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm disabled:opacity-60"
          >
            <LogOut size={16} />
            {loggingOut ? 'Signing out…' : 'Logout'}
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-slate-200 p-2 md:hidden"><Menu size={18} /></button>
              <div>
                <div className="text-lg font-semibold">Supply Office - Local Government Unit of Carigara</div>
                <div className="text-sm text-slate-500">Secure property custody tracking</div>
              </div>
            </div>
            <div className="rounded-full bg-teal-50 px-4 py-2 text-sm font-medium text-teal-700">{user?.role === 'admin' ? 'Admin' : 'User'}</div>
          </div>
        </header>
        <main className="p-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
