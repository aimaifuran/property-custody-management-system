import { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post('/auth/forgot-password', { identifier });
      toast.success(data.message || 'If an account exists, a reset link has been sent.');
      setSubmitted(true);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to process your request');
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

        <h1 className="mb-2 text-xl font-semibold">Forgot your password?</h1>
        <p className="mb-6 text-sm text-slate-400">Enter your username or email and we'll send you a link to reset your password.</p>

        {submitted ? (
          <div className="rounded-xl border border-teal-800 bg-teal-900/30 px-4 py-3 text-sm text-teal-200">
            If an account with that email or username exists, a password reset link has been sent. Please check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="forgot-identifier" className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-300">Username or email</span>
              <input
                id="forgot-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
                placeholder="Username or email"
                required
              />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
              {loading ? 'Sending…' : 'Send reset link'}
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
