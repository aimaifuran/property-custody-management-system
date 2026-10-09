import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ValidatedForm from './ValidatedForm';

const fields = [
  ['firstName', 'First Name'], ['lastName', 'Last Name'],
  ['email', 'Email', 'email'], ['username', 'Username'],
  ['password', 'Password', 'password'], ['confirmPassword', 'Confirm Password', 'password'],
  ['office', 'Office'], ['division', 'Division'],
];

export default function AddAdminDialog({ onClose, onCreated }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map(([key]) => [key, ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('input')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  const save = async event => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true); setError('');
    try {
      const { confirmPassword, password, ...details } = form;
      await axios.post('/users', { ...Object.fromEntries(Object.entries(details).map(([key, value]) => [key, value.trim()])), password, role: 'admin', permissions: [] });
      toast.success('Administrator account created');
      onCreated?.();
      onClose();
    } catch (error) { setError(error.response?.data?.message || 'Unable to create administrator account.'); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialogRef} className="user-editor-dialog" aria-labelledby="add-admin-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <ValidatedForm onSubmit={save}>
      <div className="user-editor-heading"><div><h2 id="add-admin-title">Add Admin</h2><p>Create an administrator account.</p></div><button type="button" className="user-editor-close" disabled={saving} aria-label="Close admin form" onClick={onClose}><X size={18} /></button></div>
      {error && <p className="user-editor-error" role="alert">{error}</p>}
      <fieldset disabled={saving} className="mt-4 grid gap-3 md:grid-cols-2">
        {fields.map(([key, label, type = 'text']) => <label key={key} className="block"><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><input required aria-label={label} type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} minLength={type === 'password' ? 8 : undefined} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>)}
      </fieldset>
      <div className="user-editor-footer"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="user-editor-save">{saving ? 'Saving...' : 'Create Admin'}</button></div>
    </ValidatedForm>
  </dialog>;
}
