import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Spinner from '../components/Spinner';

const formatRemaining = (lockUntil) => {
  const diffMs = lockUntil.getTime() - Date.now();
  if (diffMs <= 0) return '';
  const totalSeconds = Math.ceil(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [lockUntil, setLockUntil] = useState(null);
  const [remainingLabel, setRemainingLabel] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!lockUntil) {
      setRemainingLabel('');
      return undefined;
    }
    const tick = () => {
      const label = formatRemaining(lockUntil);
      if (!label) {
        setLockUntil(null);
        setLoginError('');
        setRemainingLabel('');
        return;
      }
      setRemainingLabel(label);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockUntil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      await login(identifier, password, rememberMe);
      navigate('/dashboard');
    } catch (error) {
      const data = error.response?.data;
      const lockInfo = data?.errors?.[0]?.lockUntil;
      if (lockInfo) {
        setLockUntil(new Date(lockInfo));
      } else {
        setLockUntil(null);
        setLoginError(data?.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const displayError = lockUntil && remainingLabel
    ? `Too many login attempts. Please try again after ${remainingLabel}`
    : loginError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-3xl font-semibold">PAIS</div>
          <p className="mt-2 text-sm text-slate-400">Property Accountability Information System</p>
        </div>
        {displayError && (
          <div className="mb-4 rounded-xl border border-rose-800 bg-rose-900/30 px-4 py-3 text-center text-sm font-medium text-rose-200">
            {displayError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="login-identifier" className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Username or email</span>
            <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3" placeholder="Username or email" />
          </label>
          <label htmlFor="login-password" className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Password</span>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3" placeholder="Password" />
          </label>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-400">
              <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me
            </label>
            <Link to="/forgot-password" className="font-semibold text-teal-400 hover:text-teal-300">Forgot password?</Link>
          </div>
          <button type="submit" disabled={loading || !!(lockUntil && remainingLabel)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {loading && <Spinner size={18} />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
