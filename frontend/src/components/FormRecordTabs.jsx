export default function FormRecordTabs({ label, showForm, onForm, onRecords, recordsLabel = 'Saved Records' }) {
  return <nav aria-label={`${label} sections`} className="flex flex-wrap gap-2">
    {[[true, label, onForm], [false, recordsLabel, onRecords]].map(([active, title, action]) => <button key={title} type="button" aria-pressed={showForm === active} onClick={action} className={`rounded-xl border px-4 py-2 font-semibold ${showForm === active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{title}</button>)}
  </nav>;
}
