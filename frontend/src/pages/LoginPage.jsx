import Skeleton from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

import { Link, useNavigate } from 'react-router-dom';

import { motion } from 'framer-motion';

import { toast } from 'react-hot-toast';

import LoginIllustration from '../components/LoginIllustration';



export default function LoginPage() {

  const [identifier, setIdentifier] = useState('admin');

  const [password, setPassword] = useState('Admin123!');

  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lockUntil, setLockUntil] = useState(() => {
    try { return Number(sessionStorage.getItem('login-lock-until')) || 0; } catch { return 0; }
  });
  const [countdown, setCountdown] = useState(() => Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)));
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (!remaining) { try { sessionStorage.removeItem('login-lock-until'); } catch {} }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  const [rememberMe, setRememberMe] = useState(true);

  const { login } = useAuth();

  const navigate = useNavigate();



  const handleSubmit = async (e) => {

    e.preventDefault();
    if (submitting || lockUntil > Date.now()) return;
    setSubmitting(true);

    try {

      await login(identifier, password, rememberMe);

      navigate('/dashboard');

    } catch (error) {

      const response = error.response;
      const serverDeadline = response?.data?.errors?.find(entry => entry.lockUntil)?.lockUntil;
      const retryAfter = Number(response?.headers?.['retry-after']);
      if (serverDeadline || (response?.status === 429 && retryAfter > 0)) {
        const deadline = serverDeadline ? new Date(serverDeadline).getTime() : Date.now() + retryAfter * 1000;
        setLockUntil(deadline);
        setCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        try { sessionStorage.setItem('login-lock-until', String(deadline)); } catch {}
      } else { toast.error(response?.data?.message || 'Login failed'); }
    } finally {
      setSubmitting(false);

    }

  };



  return (

    <div className="login-page flex min-h-screen items-center justify-center px-3 py-4 md:px-4 md:py-10 text-white">

      <div className="login-page__wash" aria-hidden="true" />

      <motion.div

        initial={{ opacity: 0, y: 24 }}

        animate={{ opacity: 1, y: 0 }}

        className="login-card-shell w-full max-w-[288px] md:max-w-[640px]"

      >

        <div className="login-card login-card--split w-full overflow-hidden rounded-2xl md:rounded-3xl">

        <div className="login-card__illustration login-illustration" aria-hidden="true">

          <LoginIllustration />

        </div>

        <div className="login-card__form p-3 md:p-5">

          <div className="mb-3 text-center">

            <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="mx-auto mb-2 aspect-square h-12 w-12 rounded-full object-cover shadow-2xl ring-2 ring-white/80 md:mb-3 md:h-16 md:w-16 md:ring-2" />

            <div className="text-xl font-bold tracking-wide md:text-3xl">PCMS</div>

            <p className="mt-1 text-xs text-white/75 md:mt-2 md:text-sm">Property Accountability Management System</p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5 md:space-y-3">

            <label htmlFor="login-identifier" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-1 md:text-sm">Username or email</span>

              <input id="login-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="login-input w-full rounded-lg px-2.5 py-1.5 text-base text-white md:rounded-lg md:px-3 md:py-2" placeholder="Username or email" />

            </label>

            <label htmlFor="login-password" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-1 md:text-sm">Password</span>

              <div className="relative">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="login-input w-full rounded-lg px-2.5 py-1.5 text-base text-white md:rounded-lg md:px-3 md:py-2" style={{ paddingRight: '2.75rem' }} placeholder="Password" />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>

            </label>

            <label className="flex min-h-8 items-center gap-2 text-xs text-white/75 md:text-sm">

              <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me

            </label>

            <button type="submit" disabled={submitting || countdown > 0} aria-label="Sign in" aria-busy={submitting} className="login-button min-h-10 w-full rounded-lg px-3 py-2 md:min-h-11 text-sm font-semibold text-white md:rounded-xl md:px-4 md:py-3 md:text-base">{submitting ? <Skeleton className="h-4 w-16" label="Signing in" /> : 'Sign in'}</button>

            {countdown > 0 && <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">Too many attempts, please try again in {countdown}s</p>}
          </form>
          <Link to="/forgot-password" className="mt-3 block py-1 text-center text-xs text-white/85 underline md:mt-3 md:py-0 md:text-sm">Forgot your password?</Link>

        </div>

        </div>

      </motion.div>

    </div>

  );

}
