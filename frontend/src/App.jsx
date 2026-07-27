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
          <Route path="/inventory-custodian" element={<IcsPage />} />
          <Route path="/par" element={<ParPage />} />
          <Route path="/transfers" element={<PtrPage />} />
          <Route path="/returns" element={<PrsPage />} />
          <Route path="/returned-supply" element={<ReturnedSupplyPage />} />
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
