import { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, PackageCheck } from 'lucide-react';

const issuedStatuses = new Set(['ISSUED', 'ACCOUNTABILITY_LOCKED']);

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

export default function MyIssuedItemsPage() {
  const [risRecords, setRisRecords] = useState([]);
  const [selectedRis, setSelectedRis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get('/ris');
        setRisRecords(data.data || []);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Unable to load your RIS records');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const issuedItems = risRecords.flatMap((ris) => (ris.items || [])
    .filter((item) => issuedStatuses.has(ris.status) && Number(item.quantityIssued || 0) > 0)
    .map((item) => ({ ...item, ris })));

  return (
    <div className="space-y-6">
      <div className="minimal-surface p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><PackageCheck size={24} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Issued Items</h1>
            <p className="text-sm text-slate-500">View only the RIS records and items issued to your account.</p>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <div className="minimal-surface p-6 text-sm text-slate-500">Loading your records...</div>}

      {!loading && (
        <>
          <section className="minimal-surface p-6">
            <h2 className="text-xl font-semibold text-slate-800">My RIS</h2>
            {risRecords.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No RIS records are linked to your account yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {risRecords.map((ris) => (
                  <div key={ris._id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-800">{ris.risNumber || 'Unassigned RIS'}</div>
                        <div className="text-sm text-slate-500">{ris.purpose || 'No purpose'} · {formatDate(ris.date || ris.issuedAt)}</div>
                      </div>
                      <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">{ris.status}</span><button type="button" onClick={() => setSelectedRis(ris)} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"><Eye size={14} /> View RIS</button></div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                      {(ris.items || []).map((item, index) => <div key={`${ris._id}-${index}`}>{item.description || 'Item'} · Qty {item.quantityIssued || item.quantityRequested || 0}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="minimal-surface p-6">
            <h2 className="text-xl font-semibold text-slate-800">My Issued Items</h2>
            {issuedItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No issued items are linked to your account yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-3 py-2">Property/Item</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">RIS No.</th><th className="px-3 py-2">Date Issued</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Details</th></tr></thead>
                  <tbody>{issuedItems.map(({ item, ris }, index) => <tr key={`${ris._id}-${index}`} className="border-b border-slate-100"><td className="px-3 py-3 font-medium">{item.description || item.stockNumber || 'Item'}</td><td className="px-3 py-3">{item.quantityIssued}</td><td className="px-3 py-3">{ris.risNumber || '—'}</td><td className="px-3 py-3">{formatDate(ris.issuedAt || ris.date)}</td><td className="px-3 py-3">{ris.status}</td><td className="px-3 py-3"><button type="button" title="View RIS" onClick={() => setSelectedRis(ris)} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"><Eye size={14} /> View RIS</button></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          {selectedRis && (
            <section className="minimal-surface p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-slate-800">RIS {selectedRis.risNumber || 'Details'}</h2><button type="button" onClick={() => setSelectedRis(null)} className="rounded-md border px-3 py-2 text-sm">Close</button></div>
              <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2"><div>Purpose: {selectedRis.purpose || '—'}</div><div>Status: {selectedRis.status}</div><div>Office: {selectedRis.office || '—'}</div><div>Date Issued: {formatDate(selectedRis.issuedAt || selectedRis.date)}</div><div>Requested by: {selectedRis.requestedBy?.name || '—'}</div><div>Received by: {selectedRis.receivedBy?.name || '—'}</div></div>
              <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="px-3 py-2">Item</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Remarks</th></tr></thead><tbody>{(selectedRis.items || []).map((item, index) => <tr key={index} className="border-b border-slate-100"><td className="px-3 py-3">{item.description || item.stockNumber || 'Item'}</td><td className="px-3 py-3">{item.quantityRequested || 0}</td><td className="px-3 py-3">{item.quantityIssued || 0}</td><td className="px-3 py-3">{item.remarks || '—'}</td></tr>)}</tbody></table></div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
