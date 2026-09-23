import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SuppliersPage from './pages/SuppliersPage';
import RisPage from './pages/RisPage';
import IarPage from './pages/IarPage';
import InventoryPage from './pages/InventoryPage';
import PtrPage from './pages/PtrPage';
import PrsPage from './pages/PrsPage';
import UsersPage from './pages/UsersPage';
import IcsPage from './pages/IcsPage';
import ParPage from './pages/ParPage';
import ReturnedSupplyPage from './pages/ReturnedSupplyPage';
import SettingsPage from './pages/SettingsPage';
import MyIssuedItemsPage from './pages/MyIssuedItemsPage';
import ReportsPage from './pages/ReportsPage';

function ProtectedRoute({ children, permission }) {
  const { user, loading, authReady } = useAuth();
  if (!authReady || loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission === 'adminOnly' && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  if (permission && user.role !== 'admin' && !requiredPermissions.some((value) => user.permissions?.includes(value))) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function RoleDashboard() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <DashboardPage /> : <MyIssuedItemsPage />;
}

const permissionRoutes = {
  '/dashboard': 'canViewDashboard',
  '/reports/monthly': 'canViewDashboard',
  '/reports/annual': 'canViewDashboard',
  '/suppliers': ['canViewSuppliers', 'canManageSuppliers'],
  '/ris': 'adminOnly',
  '/iar': ['canViewIAR', 'canManageIAR'],
  '/inventory': ['canViewDashboard', 'canManageInventory'],
  '/inventory-custodian': ['canViewRIS', 'canManageRIS', 'canManageInventory'],
  '/par': ['canViewRIS', 'canManageRIS', 'canManageInventory'],
  '/transfers': ['canViewDashboard', 'canManageInventory'],
  '/returns': ['canViewDashboard', 'canManageInventory'],
  '/returned-supply': ['canViewDashboard', 'canManageInventory'],
  '/users': 'canManageUsers',
  '/settings': 'canManageSettings',
  '/my-ris': 'canViewRIS',
  '/my-issued-items': 'canViewRIS',
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {Object.entries(permissionRoutes).map(([path, permission]) => {
            const pages = {
              '/dashboard': RoleDashboard,
              '/reports/monthly': () => <ReportsPage mode="monthly" />,
              '/reports/annual': () => <ReportsPage mode="annual" />,
              '/suppliers': SuppliersPage,
              '/ris': RisPage,
              '/iar': IarPage,
              '/inventory': InventoryPage,
              '/inventory-custodian': IcsPage,
              '/par': ParPage,
              '/transfers': PtrPage,
              '/returns': PrsPage,
              '/returned-supply': ReturnedSupplyPage,
              '/users': UsersPage,
              '/settings': SettingsPage,
              '/my-ris': MyIssuedItemsPage,
              '/my-issued-items': MyIssuedItemsPage,
            };
            const Page = pages[path];
            return <Route key={path} path={path} element={<ProtectedRoute permission={permission}><Page /></ProtectedRoute>} />;
          })}
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
