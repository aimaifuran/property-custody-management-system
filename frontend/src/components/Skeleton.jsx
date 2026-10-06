export default function Skeleton({ className = '', style, label = 'Loading' }) {
  return <span role="status" aria-label={label} className={`skeleton inline-block ${className}`} style={style}><span className="sr-only">{label}</span></span>;
}

export function PageSkeleton({ dashboard = false, fullScreen = false }) {
  const cards = count => Array.from({ length: count }, (_, index) => <div key={index} className="minimal-surface p-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-3 h-6 w-8" /></div>);
  return <div role="status" aria-label="Loading page" aria-busy="true" className={fullScreen ? 'min-h-screen p-4 sm:p-8' : 'space-y-4'}>
    <span className="sr-only">Loading page</span>
    <div aria-hidden="true" className={dashboard ? 'dashboard-page space-y-4' : 'space-y-4'}>
      <Skeleton className="h-6 w-40" />
      {dashboard ? <>
        <div className="dashboard-issue"><div className="grid">{cards(5)}</div></div>
        <div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="minimal-surface p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-36 w-full" /></div>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-44 w-full" />)}</div>
        <div className="dashboard-other"><div className="grid">{cards(4)}</div></div>
      </> : <div className="minimal-surface space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-9 w-40" /><Skeleton className="h-9 w-24" /></div>
        <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-2/3" /></div>)}
      </div>}
    </div>
  </div>;
}

export function SkeletonBar({ className = '' }) {
    return <Skeleton className={className} />;
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
