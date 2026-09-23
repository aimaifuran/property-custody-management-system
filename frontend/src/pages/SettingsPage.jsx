import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const emptySettings = {
  organizationName: '', governmentAgency: '', address: '', telephone: '', footer: '', systemName: '', lguName: 'LGU-CARIGARA',
  signatories: {
    requestedBy: { name: '', designation: '', fixed: false },
    approvedBy: { name: 'RALPH M. SAVERET JR', designation: '', fixed: true },
    issuedBy: { name: 'RALPH M. SAVERET JR', designation: '', fixed: true },
    receivedBy: { name: '', designation: '', fixed: false },
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(emptySettings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/settings').then(({ data }) => setSettings((previous) => ({ ...previous, ...data.data, signatories: { ...previous.signatories, ...data.data.signatories } }))).catch(() => toast.error('Unable to load system settings'));
  }, []);

  const update = (key, value) => setSettings((previous) => ({ ...previous, [key]: value }));
  const updateSignatory = (key, field, value) => setSettings((previous) => ({ ...previous, signatories: { ...previous.signatories, [key]: { ...previous.signatories[key], [field]: value } } }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try { await axios.put('/settings', settings); toast.success('System settings saved'); } catch (error) { toast.error(error.response?.data?.message || 'Unable to save settings'); } finally { setSaving(false); }
  };

  return <form onSubmit={save} className="space-y-6">
    <div><h1 className="text-3xl font-semibold">System Settings</h1><p className="text-sm text-slate-500">Manage the names and designations used by generated forms.</p></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Organization</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {['organizationName', 'governmentAgency', 'address', 'telephone', 'systemName', 'lguName'].map((key) => <label key={key} className="block"><span className="mb-1 block text-sm font-semibold capitalize text-slate-700">{key.replace(/([A-Z])/g, ' $1')}</span><input value={settings[key] || ''} onChange={(event) => update(key, event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" /></label>)}
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Form Signatories</h2>
      <p className="mt-1 text-sm text-slate-500">Fixed signatories are read-only in forms. Blank signatories remain editable for the person completing the form.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(settings.signatories).map(([key, signatory]) => <div key={key} className="rounded-xl border border-slate-200 p-4"><div className="mb-3 font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</div><input aria-label={`${key} name`} value={signatory.name || ''} readOnly={signatory.fixed} onChange={(event) => updateSignatory(key, 'name', event.target.value)} className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 read-only:bg-slate-100" placeholder="Printed name" /><input aria-label={`${key} designation`} value={signatory.designation || ''} readOnly={signatory.fixed} onChange={(event) => updateSignatory(key, 'designation', event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 read-only:bg-slate-100" placeholder="Designation" /><label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={Boolean(signatory.fixed)} onChange={(event) => updateSignatory(key, 'fixed', event.target.checked)} /> Fixed in forms</label></div>)}
      </div>
    </section>
    <button disabled={saving} className="rounded-xl bg-teal-600 px-5 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save Settings'}</button>
  </form>;
}
