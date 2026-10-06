import { PageSkeleton } from './components/Skeleton';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import MyReturnsPage from './pages/MyReturnsPage';
import MyIssuedItemsPage from './pages/MyIssuedItemsPage';
import ReportsPage from './pages/ReportsPage';
import MonthlyItemsReportPage from './pages/MonthlyItemsReportPage';
import PpeStationReportPage from './pages/PpeStationReportPage';
import HistoricalRecordsPage from './pages/HistoricalRecordsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children, permission }) {
  const { user, loading, authReady } = useAuth();
  const { pathname } = useLocation();
  if (!authReady || loading) return <PageSkeleton fullScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin' && !['/my-issued-items', '/my-returns'].includes(pathname)) return <Navigate to="/my-issued-items" replace />;
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
  '/reports/ppe-list': 'canViewDashboard',
  '/historical-records': 'adminOnly',
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
  '/profile': 'adminOnly',
  '/my-returns': 'canViewRIS',
  '/my-issued-items': 'canViewRIS',
};

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
          <Route path="/my-ris" element={<Navigate to="/my-issued-items" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {Object.entries(permissionRoutes).map(([path, permission]) => {
            const pages = {
              '/dashboard': RoleDashboard,
              '/reports/monthly': MonthlyItemsReportPage,
              '/reports/annual': () => <ReportsPage mode="annual" />,
              '/reports/ppe-list': PpeStationReportPage,
              '/historical-records': HistoricalRecordsPage,
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
              '/profile': ProfilePage,
              '/my-returns': MyReturnsPage,
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
