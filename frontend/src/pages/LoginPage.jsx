import ValidatedForm from '../components/ValidatedForm';
import HourglassLoader from '../components/HourglassLoader';
import FormLoader from '../components/FormLoader';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

import { Link, useNavigate } from 'react-router-dom';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { toast } from 'react-hot-toast';

import LoginIllustration from '../components/LoginIllustration';



export default function LoginPage() {

  const [identifier, setIdentifier] = useState('');

  const [password, setPassword] = useState('');
  const identifierRef = useRef(null);
  const passwordRef = useRef(null);
  const [editableFields, setEditableFields] = useState({ identifier: false, password: false });

  useEffect(() => {
    // Browsers may restore DOM values independently of React's empty state.
    const clearRestoredValues = () => {
      if (identifierRef.current) identifierRef.current.value = '';
      if (passwordRef.current) passwordRef.current.value = '';
    };
    clearRestoredValues();
    const frame = window.requestAnimationFrame(clearRestoredValues);
    const restore = event => {
      if (!event.persisted) return;
      clearRestoredValues();
      setIdentifier('');
      setPassword('');
      setEditableFields({ identifier: false, password: false });
    };
    window.addEventListener('pageshow', restore);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  const enableTyping = (event, field, value) => {
    event.currentTarget.value = value;
    event.currentTarget.readOnly = false;
    setEditableFields(previous => ({ ...previous, [field]: true }));
  };

  const [submitting, setSubmitting] = useState(false);
  const [loginDestination, setLoginDestination] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [lockUntil, setLockUntil] = useState(() => {
    try { return Number(sessionStorage.getItem('login-lock-until')) || 0; } catch { return 0; }
  });
  const [countdown, setCountdown] = useState(() => Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)));
  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (!remaining) { try { sessionStorage.removeItem('login-lock-until'); } catch { /* Keep the in-memory countdown when storage is unavailable. */ } }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  const [rememberMe, setRememberMe] = useState(true);

  const { login } = useAuth();

  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const signingIn = submitting || !!loginDestination;

  useEffect(() => {
    if (!loginDestination) return;
    const timer = window.setTimeout(() => navigate(loginDestination, { replace: true }), 2000);
    return () => window.clearTimeout(timer);
  }, [loginDestination, navigate]);



  const handleSubmit = async (e) => {

    e.preventDefault();
    if (signingIn || lockUntil > Date.now()) return;
    setSubmitting(true);

    try {

      const result = await login(identifier, password, rememberMe);
      setLoginDestination(result.data?.user?.role === 'admin' ? '/dashboard' : '/my-issued-items');

    } catch (error) {

      const response = error.response;
      const serverDeadline = response?.data?.errors?.find(entry => entry.lockUntil)?.lockUntil;
      const retryAfter = Number(response?.headers?.['retry-after']);
      if (serverDeadline || (response?.status === 429 && retryAfter > 0)) {
        const deadline = serverDeadline ? new Date(serverDeadline).getTime() : Date.now() + retryAfter * 1000;
        setLockUntil(deadline);
        setCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        try { sessionStorage.setItem('login-lock-until', String(deadline)); } catch { /* The active page still enforces the server's retry deadline. */ }
      } else { toast.error(response?.data?.message || 'Login failed'); }
    } finally {
      setSubmitting(false);

    }

  };



  return (

    <div className="login-page flex min-h-screen items-center justify-center px-3 py-4 md:px-4 md:py-10 text-white">

      <div className="login-page__wash" aria-hidden="true" />

      <motion.div

        initial={reducedMotion ? false : { opacity: 0, y: 24 }}

        animate={{ opacity: 1, y: 0 }}

        className="login-card-shell w-full max-w-[288px] md:max-w-[640px]"

      >

        <div className="login-card login-card--split w-full overflow-hidden rounded-2xl md:rounded-3xl">

        <div className={`login-card__illustration login-illustration ${signingIn ? 'login-card__illustration--signing-in' : ''}`}>
          <div className={`login-illustration-stage ${signingIn ? 'login-illustration-stage--signing-in' : ''}`}>
            <div className="login-illustration-layer login-illustration-layer--original" aria-hidden="true">
              <LoginIllustration />
            </div>
            <AnimatePresence>
              {signingIn && <motion.div key="login-laptop" className="login-illustration-layer login-illustration-layer--laptop" initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.35, ease: 'easeOut' }}>
                <FormLoader loginTransition label={loginDestination ? 'Welcome to PAMS...' : 'Signing in...'} />
              </motion.div>}
            </AnimatePresence>
          </div>
        </div>

        <div className="login-card__form p-3 md:p-5">

          <div className="mb-3 text-center">

            <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="mx-auto mb-2 aspect-square h-12 w-12 rounded-full object-cover shadow-2xl ring-2 ring-white/80 md:mb-3 md:h-16 md:w-16 md:ring-2" />

            <div className="text-xl font-bold tracking-wide md:text-3xl">PAMS</div>

            <p className="mt-1 text-xs text-white/75 md:mt-2 md:text-sm">Property Accountability Management System</p>

          </div>

          <ValidatedForm autoComplete="off" onSubmitCapture={() => {
            if (identifierRef.current) {
              identifierRef.current.value = identifier;
              identifierRef.current.readOnly = false;
            }
            if (passwordRef.current) {
              passwordRef.current.value = password;
              passwordRef.current.readOnly = false;
            }
            setEditableFields({ identifier: true, password: true });
          }} onSubmit={handleSubmit} inert={signingIn ? true : undefined} aria-busy={signingIn} className="space-y-2.5 md:space-y-3">

            <label htmlFor="login-identifier" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-1 md:text-sm">Username or email</span>

              <input required ref={identifierRef} id="login-identifier" name="login-identifier" autoComplete="off" data-lpignore="true" data-1p-ignore readOnly={!editableFields.identifier} onFocus={event => enableTyping(event, 'identifier', identifier)} value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="login-input w-full rounded-lg px-2.5 py-1.5 text-base text-white md:rounded-lg md:px-3 md:py-2" />

            </label>

            <label htmlFor="login-password" className="block">

              <span className="mb-1 block text-xs font-semibold text-white/85 md:mb-1 md:text-sm">Password</span>

              <div className="relative">
                <input required ref={passwordRef} id="login-password" name="login-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" data-lpignore="true" data-1p-ignore readOnly={!editableFields.password} onFocus={event => enableTyping(event, 'password', password)} value={password} onChange={(e) => setPassword(e.target.value)} className="login-input w-full rounded-lg px-2.5 py-1.5 text-base text-white md:rounded-lg md:px-3 md:py-2" style={{ paddingRight: '2.75rem' }} />
                <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>

            </label>

            <label className="flex min-h-8 items-center gap-2 text-xs text-white/75 md:text-sm">

              <input id="remember-me" type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} /> Remember me

            </label>

            <button type="submit" disabled={signingIn || countdown > 0} aria-label="Sign in" aria-busy={signingIn} className="login-button min-h-10 w-full rounded-lg px-3 py-2 md:min-h-11 text-sm font-semibold text-white md:rounded-xl md:px-4 md:py-3 md:text-base">{signingIn ? <span className="login-button-content"><HourglassLoader /><span>{loginDestination ? 'Opening your account...' : 'Signing in...'}</span></span> : 'Sign in'}</button>

            {countdown > 0 && <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-900">Too many attempts, please try again in {countdown}s</p>}
          </ValidatedForm>
          <Link to="/forgot-password" className="mt-3 block py-1 text-center text-xs text-white/85 underline md:mt-3 md:py-0 md:text-sm">Forgot your password?</Link>
          <div className="mt-4 border-t border-white/20 pt-3 text-center"><p className="text-xs text-white/75">Don't have an account?</p><Link to="/register" className="mt-2 block rounded-lg border border-white/50 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">Register</Link></div>

        </div>

        </div>

      </motion.div>

    </div>

  );

}
