import { Trash2 } from 'lucide-react';

export default function DeleteRowButton({ index = 0, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Delete row ${index + 1}`}
      title="Delete row"
    >
      <Trash2 size={14} />
    </button>
  );
}
