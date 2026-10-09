import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2 } from 'lucide-react';
import ValidatedForm from '../components/ValidatedForm';
import HourglassLoader from '../components/HourglassLoader';

const fields = [
  ['firstName', 'First Name'], ['middleName', 'Middle Name (optional)'], ['lastName', 'Last Name'],
  ['email', 'Email', 'email'], ['username', 'Username'], ['office', 'LGU Office'],
  ['division', 'Division / Unit'], ['position', 'LGU Position'],
  ['password', 'Password', 'password'], ['confirmPassword', 'Confirm Password', 'password'],
];
const offices = ['Office of the Municipal Mayor', 'Office of the Municipal Vice Mayor', 'Supply Office', 'Municipal Planning and Development Office', 'Municipal Budget Office', 'Municipal Accounting Office', 'Municipal Treasurer’s Office', 'Municipal Engineering Office', 'Municipal Health Office', 'Municipal Social Welfare and Development Office', 'Municipal Agriculture Office', 'Human Resource Management Office'];
const positions = ['Administrative Aide', 'Administrative Assistant', 'Administrative Officer', 'Supply Officer', 'Municipal Accountant', 'Municipal Treasurer', 'Budget Officer', 'Planning and Development Coordinator', 'Municipal Engineer', 'Health Officer', 'Social Welfare Officer', 'Agricultural Technologist', 'Department Head', 'Clerk'];

export default function RegisterPage() {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(([key]) => [key, ''])));
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true); setError('');
    try {
      await axios.post('/registration', form);
      setSent(true);
      setForm(Object.fromEntries(fields.map(([key]) => [key, ''])));
    } catch (error) { setError(error.response?.data?.message || 'Unable to send registration request. Please try again.'); }
    finally { setSaving(false); }
  };
  return <div className="login-page flex min-h-screen items-center justify-center px-4 py-8 text-white">
    <div className="login-page__wash" aria-hidden="true" />
    <div className="login-card-shell relative w-full max-w-2xl"><div className="login-card rounded-2xl p-6 sm:p-8">
      <div className="mb-6 text-center"><img src="/lgu-logo.png" alt="Municipality of Carigara official seal" className="mx-auto mb-3 h-16 w-16 rounded-full" /><h1 className="text-2xl font-bold">Register for PAMS</h1><p className="mt-2 text-sm text-white/75">Submit your details for administrator approval.</p></div>
      {sent ? <div role="status" className="py-6 text-center"><CheckCircle2 size={48} className="mx-auto mb-4 text-lime-200" aria-hidden="true" /><h2 className="text-xl font-semibold">Request sent</h2><p className="mt-3 text-white/80">Your account will become available after an administrator approves your request. Use your chosen username and password once approved.</p></div> : <ValidatedForm onSubmit={submit} aria-busy={saving}>
        {error && <p role="alert" className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800">{error}</p>}
        <fieldset disabled={saving} className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map(([key, label, type = 'text']) => <label key={key} className="block min-w-0"><span className="mb-1 block text-sm font-semibold text-white/85">{label}</span><input aria-label={label} name={key} type={type} required={key !== 'middleName'} minLength={type === 'password' ? 8 : key === 'username' ? 3 : undefined} maxLength={type === 'password' ? 72 : ['firstName', 'middleName', 'lastName'].includes(key) ? 100 : key === 'username' ? 50 : 150} pattern={key === 'username' ? '[A-Za-z0-9._-]{3,50}' : undefined} autoComplete={type === 'password' ? 'new-password' : key === 'email' ? 'email' : 'off'} list={key === 'office' ? 'registration-offices' : key === 'position' ? 'registration-positions' : undefined} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="login-input w-full rounded-lg px-3 py-2" /></label>)}</fieldset>
        <datalist id="registration-offices">{offices.map(office => <option key={office} value={office} />)}</datalist><datalist id="registration-positions">{positions.map(position => <option key={position} value={position} />)}</datalist>
        <p className="mt-4 text-xs text-white/75">Choose your LGU office and position, or type the official name if it is not listed. Password must contain at least 8 characters.</p>
        <button type="submit" disabled={saving} className="login-button mt-5 w-full rounded-xl px-4 py-3 font-semibold">{saving ? <span className="login-button-content"><HourglassLoader />Sending request...</span> : 'Send Registration Request'}</button>
      </ValidatedForm>}
      <Link to="/login" className="mt-5 block text-center text-sm text-white/85 underline">Back to Sign in</Link>
    </div></div>
  </div>;
}
