import { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from './Skeleton';

export default function NewFormButton({ onNew, editorRef, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await onNew();
      requestAnimationFrame(() => editorRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to open a new form'); }
    finally { setBusy(false); }
  };
  return <button type="button" disabled={disabled || busy} aria-label="New Form" onClick={open} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{busy ? <Skeleton className="h-4 w-16" label="Opening new form" /> : <><Plus size={13} /> New Form</>}</button>;
}
