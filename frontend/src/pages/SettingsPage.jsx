import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PageSkeleton } from '../components/Skeleton';

export default function SettingsPage() {
  const [signatoryForms, setSignatoryForms] = useState([]);
  const [signatories, setSignatories] = useState(null);
  const [savingSignatories, setSavingSignatories] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    axios.get('/settings/form-signatories', { signal: controller.signal })
      .then(({ data }) => { setSignatories(data.data.signatories); setSignatoryForms(data.data.forms); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) return <PageSkeleton />;
  return <div className="space-y-6">
    {loadError ? <p role="alert" className="text-rose-700">Unable to load settings. Refresh this page to retry.</p> : <>
      <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={async event => {
        event.preventDefault(); setSavingSignatories(true);
        try { const { data } = await axios.patch('/settings/form-signatories', signatories); setSignatories(data.data); window.dispatchEvent(new Event('form-signatories-updated')); toast.success('Form signatories saved'); }
        catch (error) { toast.error(error.response?.data?.message || 'Unable to save signatories'); }
        finally { setSavingSignatories(false); }
      }}>
        <h2 className="text-lg font-semibold">Form Signatories</h2>
        <p className="mt-1 text-sm text-slate-500">Set each name and designation here. New forms display these values as text. Account-linked signatories use the selected user. Saved records retain their recorded names.</p>
        <fieldset disabled={savingSignatories}>
          {signatoryForms.map(form => <section key={form.key} className="mt-5 rounded-xl border-2 border-emerald-800/50 bg-emerald-50/30 p-4 sm:p-5"><h3 className="font-semibold text-teal-800">{form.title}</h3><div className="mt-3 space-y-4">{form.roles.filter(role => !role.account).map(role => <div key={role.key} className="grid gap-3 rounded-lg border border-emerald-800/25 bg-white p-3 md:grid-cols-[1fr_2fr_2fr]"><div className="text-sm font-semibold">{role.label}</div>{['name', 'designation'].map(field => <label key={field} className="block text-sm"><span className="mb-1 block">{field === 'name' ? 'Name' : 'Designation / Position'}</span><input aria-label={`${form.title} ${role.label} ${field}`} maxLength={200} value={signatories?.[form.key]?.[role.key]?.[field] || ''} onChange={event => setSignatories(previous => ({ ...previous, [form.key]: { ...previous[form.key], [role.key]: { ...previous[form.key][role.key], [field]: event.target.value } } }))} className="w-full rounded-lg border-2 border-slate-400 px-3 py-2 focus:border-emerald-700 focus:outline-none" /></label>)}</div>)}</div></section>)}
          <button type="submit" disabled={savingSignatories || !signatories} className="mt-5 rounded-xl bg-teal-700 px-5 py-2 font-semibold text-white disabled:opacity-50">{savingSignatories ? 'Saving...' : 'Save Signatories'}</button>
        </fieldset>
      </form>

    </>}
  </div>;
}
