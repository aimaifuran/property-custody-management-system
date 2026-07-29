import { Loader2, Check } from 'lucide-react';

const TYPE_CONFIG = {
    excel: { src: '/excel-icon.png', title: 'Download Excel', color: '#107C41', size: 38 },
    pdf: { src: '/pdf-icon.png', title: 'Download PDF', color: '#DB2E22', size: 18 },
    update: { src: '/update-icon.png', title: 'Update', color: '#0d9488', size: 20 },
    print: { src: '/print-icon.png', title: 'Print', color: '#475569', size: 20 },
};

export default function DownloadButton({ type, status = 'idle', onClick, className = '' }) {
    const { src, title, color, size } = TYPE_CONFIG[type];
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={status !== 'idle'}
            title={title}
            aria-label={title}
            style={{ color, borderColor: `${color}40`, backgroundColor: `${color}14` }}
            className={`inline-flex h-[38px] w-[70px] shrink-0 items-center justify-center rounded-xl border transition hover:brightness-95 disabled:opacity-60 ${className}`}
        >
            {status === 'loading' ? (
                <Loader2 size={20} className="animate-spin" />
            ) : status === 'success' ? (
                <Check size={20} />
            ) : (
                <img src={src} alt={title} width={size} height={size} className="object-contain" />
            )}
        </button>
    );
}
