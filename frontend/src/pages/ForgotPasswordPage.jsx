import ValidatedForm from '../components/ValidatedForm';
import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/forgot-password', { email: email.trim() });
      toast.success(data.message || 'Check your email for the verification code.');
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to process your request');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async event => {
    event.preventDefault();
    if (loading) return;
    if (password !== confirmation) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/reset-password-code', { email: email.trim(), code, password });
      toast.success(data.message); navigate('/login');
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to reset password'); }
    finally { setLoading(false); }
  };

  return <main className="login-page forgot-password-page">
    <div className="login-page__wash" aria-hidden="true" />
    <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.25 }} className="login-card recovery-card" aria-labelledby="recovery-title">
      <div className="recovery-brand"><img src="/lgu-logo.png" alt="Municipality of Carigara official seal" width="52" height="52" /><div><div className="recovery-brand__name">PAMS</div><p>Property Accountability<br />Management System</p></div></div>
      <div className="recovery-heading"><div className="recovery-icon" aria-hidden="true"><KeyRound size={24} /></div><p className="recovery-eyebrow">Account recovery</p><h1 id="recovery-title">{submitted ? 'Reset your password' : 'Forgot your password?'}</h1><p id="recovery-description">{submitted ? `Enter the six-digit code sent to ${email} and choose a new password. The code expires in 10 minutes.` : 'Enter the email address registered to your user or administrator account.'}</p></div>
      {submitted ? <ValidatedForm onSubmit={resetPassword} className="recovery-form">
        <label className="block"><span className="recovery-label">Verification code</span><input className="login-input recovery-input" aria-label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} disabled={loading} /></label>
        <label className="block"><span className="recovery-label">New password</span><input className="login-input recovery-input" aria-label="New password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} disabled={loading} /></label>
        <label className="block"><span className="recovery-label">Confirm new password</span><input className="login-input recovery-input" aria-label="Confirm new password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={loading} /></label>
        <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">{loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Updating...</> : 'Verify Code and Update Password'}</button>
        <button type="button" disabled={loading} onClick={handleSubmit} className="recovery-back">Send a new code</button>
        <button type="button" disabled={loading} onClick={() => { setSubmitted(false); setCode(''); setPassword(''); setConfirmation(''); }} className="recovery-back">Use a different email</button>
      </ValidatedForm> : <ValidatedForm onSubmit={handleSubmit} className="recovery-form">
        <label htmlFor="forgot-email" className="block"><span className="recovery-label">Account email</span><div className="recovery-input-wrap"><Mail size={18} aria-hidden="true" /><input id="forgot-email" type="email" value={email} onChange={event => setEmail(event.target.value)} className="login-input recovery-input" placeholder="Enter your registered email" autoComplete="email" autoCapitalize="none" spellCheck={false} aria-describedby="recovery-description" disabled={loading} required /></div></label>
        <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">{loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Sending code...</> : <>Send Verification Code <ArrowRight size={18} aria-hidden="true" /></>}</button>
        <div className="recovery-help"><ShieldCheck size={18} aria-hidden="true" /><p>Users and administrators can reset their password through their registered email. Check your spam folder too.</p></div>
      </ValidatedForm>}
      <footer className="recovery-footer"><Link to="/login" className="recovery-back"><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link></footer>
    </motion.section>
  </main>;
}
