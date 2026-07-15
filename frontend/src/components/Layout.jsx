import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Package2, FileText, ClipboardList, FileCheck2, Send, ArrowLeftRight, RotateCcw, Users, LogOut, Menu, Archive } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permissions: ['canViewDashboard'] },
  { to: '/suppliers', label: 'Suppliers', icon: Package2, permissions: ['canViewSuppliers'] },
  { to: '/ris', label: 'Requisition & Issue', icon: FileText, permissions: ['canViewRIS', 'canCreateRIS', 'canReviewRIS', 'canManageRIS'] },
  { to: '/iar', label: 'Inspection & Acceptance Report', icon: FileCheck2, permissions: ['canViewIAR'] },
  { to: '/inventory', label: 'Property Card', icon: ClipboardList, permissions: ['canViewDashboard'] },
  { to: '/inventory-custodian', label: 'Inventory Custodian', icon: Archive, permissions: ['canViewDashboard'] },
  { to: '/par', label: 'Property Acknowledgement Receipts', icon: FileText, permissions: ['canViewDashboard'] },
  { to: '/transfers', label: 'Property Transfer Report', icon: ArrowLeftRight, permissions: ['canViewDashboard'] },
  { to: '/returns', label: 'Property Return Slip', icon: RotateCcw, permissions: ['canViewDashboard'] },
  { to: '/returned-supply', label: 'Returned Supply', icon: Send, permissions: ['canViewDashboard'] },
  { to: '/users', label: 'User Management', icon: Users, permissions: ['canManageUsers'] },
];

const canAccessNavItem = (user, item) => (
  user?.role === 'admin' || item.permissions?.some((permission) => user?.permissions?.includes(permission))
);

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900">
      <aside className="hidden md:flex min-h-screen w-72 flex-col border-r border-slate-200 bg-slate-950 p-6 text-slate-100">
        <div className="mb-8">
          <div className="text-2xl font-semibold">PCMS</div>
          <p className="text-sm text-slate-400">Property Custody Management System</p>
        </div>
        <nav className="space-y-2">
          {navItems.filter((item) => canAccessNavItem(user, item)).map((item) => {
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
          <button onClick={logout} className="mt-4 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-slate-200 p-2 md:hidden"><Menu size={18} /></button>
              <div>
                <div className="text-lg font-semibold">Government Supply Office</div>
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
