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
    <div className="login-page flex min-h-screen items-center justify-center px-4 py-10 text-white">
      <div className="login-page__wash" aria-hidden="true" />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="login-card w-full max-w-md rounded-3xl p-8 sm:p-9">
        <div className="mb-7 text-center">
          <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="mx-auto mb-5 aspect-square h-28 w-28 rounded-full object-cover shadow-2xl ring-4 ring-white/80" />
          <div className="text-3xl font-bold tracking-wide">PCMS</div>
          <p className="mt-2 text-sm text-white/75">Property Accountability Management System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label htmlFor="login-identifier" className="block">
            <span className="mb-2 block text-sm font-semibold text-white/85">Username or email</span>
            <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="login-input w-full rounded-xl px-4 py-3 text-white" placeholder="Username or email" />
          </label>
          <label htmlFor="login-password" className="block">
            <span className="mb-2 block text-sm font-semibold text-white/85">Password</span>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="login-input w-full rounded-xl px-4 py-3 text-white" placeholder="Password" />
          </label>
          <label className="flex items-center gap-2 text-sm text-white/75">
            <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me
          </label>
          <button type="submit" className="login-button w-full rounded-xl px-4 py-3 font-semibold text-white">Sign in</button>
        </form>
      </motion.div>
    </div>
  );
}
