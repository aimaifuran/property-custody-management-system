import { Plus } from 'lucide-react';

export default function AddRowButton({ onClick, disabled = false, label = 'Add Row' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus size={16} />
      {label}
    </button>
  );
}
