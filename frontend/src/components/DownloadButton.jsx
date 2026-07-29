import { Loader2, Check } from 'lucide-react';

const VARIANTS = {
    dark: 'mt-2 bg-slate-900 text-white',
    outline: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
};

export default function DownloadButton({ label, icon: Icon, status = 'idle', onClick, variant = 'dark', width = 'w-20', className = '' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={status !== 'idle'}
            className={`inline-flex ${width} items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-90 ${VARIANTS[variant]} ${className}`}
        >
            {status === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
            ) : status === 'success' ? (
                <Check size={16} />
            ) : (
                <>
                    {Icon && <Icon size={16} />}
                    {label}
                </>
            )}
        </button>
    );
}
