export default function Pagination({ page, pageCount, onPageChange, perPage, onPerPageChange }) {
  if (pageCount <= 1 && !onPerPageChange) return null;
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
    <div className="flex items-center gap-2"><span>Rows per page</span><select value={perPage} onChange={(event) => onPerPageChange(Number(event.target.value))} className="rounded-lg border border-slate-200 px-2 py-1"><option value="5">5</option><option value="10">10</option><option value="25">25</option></select><span>Page {page} of {pageCount}</span></div>
    <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div>
  </div>;
}
