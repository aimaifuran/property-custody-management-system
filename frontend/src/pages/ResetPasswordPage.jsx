import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/reset-password', { token, password });
      toast.success(data.message || 'Password updated');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-3xl font-semibold">PAIS</div>
          <p className="mt-2 text-sm text-slate-400">Property Accountability Information System</p>
        </div>

        <h1 className="mb-2 text-xl font-semibold">Reset your password</h1>

        {!token ? (
          <div className="rounded-xl border border-rose-800 bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            This reset link is missing or invalid. Please request a new one.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="reset-password" className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">New password</span>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </label>
            <label htmlFor="reset-confirm-password" className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Confirm new password</span>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
                placeholder="Re-enter new password"
                minLength={8}
                required
              />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-slate-400">
          <Link to="/login" className="font-semibold text-teal-400 hover:text-teal-300">Back to sign in</Link>
        </div>
      </motion.div>
    </div>
  );
}
