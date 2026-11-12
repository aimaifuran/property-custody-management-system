import AuthField from '../components/AuthField';
import ValidatedForm from '../components/ValidatedForm';
import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_PATTERN } from '../utils/passwordPolicy';

export default function ForgotPasswordPage({ embedded = false, onBack }) {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/forgot-password', { email: email.trim() });
      toast.success(data.message || 'Check your email for the verification code.');
      setCode(''); setPassword(''); setConfirmation(''); setCodeVerified(false);
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to process your request');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async event => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/verify-password-reset-code', { email: email.trim(), code });
      setCodeVerified(true);
      toast.success(data.message || 'Verification code confirmed.');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to verify code'); }
    finally { setLoading(false); }
  };

  const resetPassword = async event => {
    event.preventDefault();
    if (loading) return;
    if (password !== confirmation) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/reset-password-code', { email: email.trim(), code, password });
      toast.success(data.message); if (onBack) onBack(); else navigate('/login');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to reset password'); }
    finally { setLoading(false); }
  };

  return <main className={embedded ? "forgot-password-page recovery-embedded" : "login-page forgot-password-page"}>
    {!embedded && <div className="login-page__wash" aria-hidden="true" />}
    <motion.section initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.25 }} className={embedded ? "recovery-card" : "login-card recovery-card auth-light-card"} aria-labelledby="recovery-title">
      <div className="recovery-brand"><img src="/lgu-logo.png" alt="Municipality of Carigara official seal" width="52" height="52" /><div><div className="recovery-brand__name">PAMS</div><p>Property Accountability<br />Management System</p></div></div>
      <div className="recovery-heading"><div className="recovery-icon" aria-hidden="true"><KeyRound size={24} /></div><p className="recovery-eyebrow">Account recovery</p><h1 id="recovery-title">{submitted ? codeVerified ? 'Choose a new password' : 'Verify your email' : 'Forgot your password?'}</h1><p id="recovery-description">{submitted ? codeVerified ? 'Your email is verified. Choose a new password to finish resetting your account.' : `Enter the six-digit code sent to ${email}. The code expires in 10 minutes.` : 'Enter the email address registered to your user or administrator account.'}</p></div>
      {submitted ? codeVerified ? <ValidatedForm onSubmit={resetPassword} className="recovery-form">
        <div className="recovery-verified-code" role="status"><ShieldCheck size={18} aria-hidden="true" />Verification code confirmed</div>
        <AuthField className="block"><span className="recovery-label">New password</span><input className="login-input recovery-input" aria-label="New password" type="password" autoComplete="new-password" minLength={8} maxLength={72} pattern={PASSWORD_POLICY_PATTERN} title={PASSWORD_POLICY_MESSAGE} required value={password} onChange={event => setPassword(event.target.value)} disabled={loading} /></AuthField>
        <AuthField className="block"><span className="recovery-label">Confirm new password</span><input className="login-input recovery-input" aria-label="Confirm new password" type="password" autoComplete="new-password" minLength={8} maxLength={72} pattern={PASSWORD_POLICY_PATTERN} title={PASSWORD_POLICY_MESSAGE} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={loading} /></AuthField>
        <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">{loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Updating...</> : 'Update Password'}</button>
        <button type="button" disabled={loading} onClick={() => setCodeVerified(false)} className="recovery-back">Back to verification code</button>
        <button type="button" disabled={loading} onClick={() => { setSubmitted(false); setCodeVerified(false); setCode(''); setPassword(''); setConfirmation(''); }} className="recovery-back">Use a different email</button>
      </ValidatedForm> : <ValidatedForm onSubmit={verifyCode} className="recovery-form">
        <AuthField className="block"><span className="recovery-label">Verification code</span><input className="login-input recovery-input" aria-label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={loading} /></AuthField>
        <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">{loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Verifying...</> : 'Verify Code'}</button>
        <button type="button" disabled={loading} onClick={handleSubmit} className="recovery-back">Send a new code</button>
        <button type="button" disabled={loading} onClick={() => { setSubmitted(false); setCodeVerified(false); setCode(''); setPassword(''); setConfirmation(''); }} className="recovery-back">Use a different email</button>
      </ValidatedForm> : <ValidatedForm onSubmit={handleSubmit} className="recovery-form">
        <AuthField htmlFor="forgot-email" className="block"><span className="recovery-label">Account email</span><div className="recovery-input-wrap"><Mail size={18} aria-hidden="true" /><input id="forgot-email" type="email" value={email} onChange={event => setEmail(event.target.value)} className="login-input recovery-input" placeholder="Enter your registered email" autoComplete="email" autoCapitalize="none" spellCheck={false} aria-describedby="recovery-description" disabled={loading} required /></div></AuthField>
        <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">{loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Sending code...</> : <>Send Verification Code <ArrowRight size={18} aria-hidden="true" /></>}</button>
        <div className="recovery-help"><ShieldCheck size={18} aria-hidden="true" /><p>Users and administrators can reset their password through their registered email. Check your spam folder too.</p></div>
      </ValidatedForm>}
      <footer className="recovery-footer">{onBack ? <button type="button" disabled={loading} onClick={onBack} className="recovery-back"><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</button> : <Link to="/login" className="recovery-back"><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>}</footer>
    </motion.section>
  </main>;
}
