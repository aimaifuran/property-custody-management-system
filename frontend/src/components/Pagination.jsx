import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export function SearchInput({ value, onChange, placeholder = 'Search records…' }) {
    return (
        <div className="relative w-full md:max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
        </div>
    );
}

const DEFAULT_LIMIT_OPTIONS = [5, 10, 25, 50, 100];

export function PageSizeSelect({ limit, onChange, options = DEFAULT_LIMIT_OPTIONS }) {
    return (
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <span>Per page</span>
            <select
                value={limit}
                onChange={(e) => onChange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
                {options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </label>
    );
}

export function Pagination({ page, totalPages, total, onChange }) {
    if (total === 0) return null;
    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            <span>Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}</span>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onChange(page - 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <ChevronLeft size={16} /> Prev
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onChange(page + 1)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Next <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
