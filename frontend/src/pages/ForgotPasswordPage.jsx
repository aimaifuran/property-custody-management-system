import { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/forgot-password', { identifier: identifier.trim() });
      toast.success(data.message || 'Your request has been sent for administrator approval.');
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to process your request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page forgot-password-page">
      <div className="login-page__wash" aria-hidden="true" />
      <motion.section
        initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
        className="login-card recovery-card"
        aria-labelledby="recovery-title"
      >
        <div className="recovery-brand">
          <img src="/lgu-logo.png" alt="Municipality of Carigara official seal" width="52" height="52" />
          <div>
            <div className="recovery-brand__name">PAMS</div>
            <p>Property Accountability<br />Management System</p>
          </div>
        </div>

        <div className="recovery-heading">
          <div className="recovery-icon" aria-hidden="true">{submitted ? <CheckCircle2 size={24} /> : <KeyRound size={24} />}</div>
          <p className="recovery-eyebrow">Account recovery</p>
          <h1 id="recovery-title">{submitted ? 'Request submitted' : 'Forgot your password?'}</h1>
          <p id="recovery-description">{submitted ? 'Your next steps are below.' : 'Enter your username or registered email to recover access to your account.'}</p>
        </div>

        {submitted ? (
          <div className="recovery-confirmation" role="status" aria-live="polite">
            <Mail size={20} aria-hidden="true" />
            <div>
              <h2>Watch for your recovery email</h2>
              <p>If an active user account matches your details, your administrator will receive the request. After approval, a reset link will be sent to your registered email.</p>
              <p>Admin accounts receive a recovery email directly. Check your spam folder too.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="recovery-form">
            <label htmlFor="forgot-identifier" className="block">
              <span className="recovery-label">Username or email</span>
              <div className="recovery-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input
                  id="forgot-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="login-input recovery-input"
                  placeholder="Enter your username or email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby="recovery-description recovery-help"
                  disabled={loading}
                  required
                />
              </div>
            </label>
            <button type="submit" disabled={loading} aria-busy={loading} className="login-button recovery-submit">
              {loading ? <><LoaderCircle className="recovery-spinner" size={18} aria-hidden="true" /> Sending request...</> : <>Request password reset <ArrowRight size={18} aria-hidden="true" /></>}
            </button>
            <div id="recovery-help" className="recovery-help">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>User requests need administrator approval. Admin accounts receive a recovery email directly.</p>
            </div>
          </form>
        )}

        <footer className="recovery-footer">
          <Link to="/login" className="recovery-back"><ArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>
        </footer>
      </motion.section>
    </main>
  );
}
