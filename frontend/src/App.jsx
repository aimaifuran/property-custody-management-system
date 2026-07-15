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
import WorkflowPlaceholderPage from './pages/WorkflowPlaceholderPage';
import AccountabilitiesPage from './pages/AccountabilitiesPage';

function ProtectedRoute({ children }) {
  const { user, loading, authReady } = useAuth();
  if (!authReady || loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/ris" element={<RisPage />} />
          <Route path="/iar" element={<IarPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory-custodian" element={<AccountabilitiesPage title="Inventory Custodian" description="Track ICS documents generated from low-value issued assets." formType="ICS" />} />
          <Route path="/par" element={<AccountabilitiesPage title="Property Acknowledgement Receipts" description="Track PAR documents generated from higher-value assets." formType="PAR" />} />
          <Route path="/transfers" element={<PtrPage />} />
          <Route path="/returns" element={<PrsPage />} />
          <Route path="/returned-supply" element={<WorkflowPlaceholderPage title="Returned Supply" description="Record returned supply transactions and supporting details." />} />
          <Route path="/users" element={<UsersPage />} />
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
