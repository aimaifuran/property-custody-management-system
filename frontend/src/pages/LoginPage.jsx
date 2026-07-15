import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [rememberMe, setRememberMe] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(identifier, password, rememberMe);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="text-3xl font-semibold">PCMS</div>
          <p className="mt-2 text-sm text-slate-400">Property Custody Management System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="login-identifier" className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Username or email</span>
            <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3" placeholder="Username or email" />
          </label>
          <label htmlFor="login-password" className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-300">Password</span>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3" placeholder="Password" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me
          </label>
          <button type="submit" className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white">Sign in</button>
        </form>
      </motion.div>
    </div>
  );
}
