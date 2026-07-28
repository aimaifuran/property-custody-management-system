export function SkeletonBar({ className = '' }) {
    return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

// Mimics the "record row" shape used across the app's saved-records lists:
// a title/subtitle block on the left, optional button-shaped placeholders on the right.
export function SkeletonListItem({ actions = 0 }) {
    return (
        <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                    <SkeletonBar className="h-4 w-40" />
                    <SkeletonBar className="h-3 w-64" />
                </div>
                {actions > 0 && (
                    <div className="flex gap-2">
                        {Array.from({ length: actions }).map((_, i) => (
                            <SkeletonBar key={i} className="h-8 w-16 rounded-xl" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function SkeletonList({ count = 3, actions = 0, className = 'mt-3 space-y-3' }) {
    return (
        <div className={className}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonListItem key={i} actions={actions} />
            ))}
        </div>
    );
}

// Mimics the Dashboard's stat cards (both the colored "Issue" cards and the
// white "Other Records" cards) — same outer shape, neutral shimmer inside.
export function SkeletonStatCard({ big = false }) {
    return (
        <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${big ? 'p-5' : 'p-4'}`}>
            <div className="flex items-start justify-between gap-3">
                <SkeletonBar className={big ? 'h-4 w-32' : 'h-3 w-24'} />
                <SkeletonBar className={big ? 'h-10 w-10 shrink-0 rounded-2xl' : 'h-4 w-4 shrink-0 rounded'} />
            </div>
            <SkeletonBar className={big ? 'mt-4 h-8 w-16' : 'mt-3 h-6 w-12'} />
        </div>
    );
}
