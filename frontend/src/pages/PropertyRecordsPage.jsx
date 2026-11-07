import SearchInput from '../components/SearchInput';
import TableScroll from '../components/TableScroll';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { formNumber } from '../utils/formNumbers';
import { risStockNumber } from '../utils/risItemSelection';
import './PropertyRecordsPage.css';

const userName = user => [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ').trim() || user.username || 'User';
const idOf = value => String(value?._id || value || '');
const dateLabel = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
const amountLabel = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

export default function PropertyRecordsPage() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    axios.get('/users', { params: { role: 'user' }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUsers((data.data || []).filter(user => user.role === 'user')); })
      .catch(requestError => { if (!controller.signal.aborted) setUsersError(requestError.response?.data?.message || 'Unable to load user accounts.'); })
      .finally(() => { if (!controller.signal.aborted) setUsersLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedUser) { setRecords(null); setLoading(false); setError(''); return undefined; }
    const controller = new AbortController();
    setLoading(true); setError(''); setRecords(null);
    axios.get(`/users/${selectedUser._id}/records`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRecords(data.data || {}); })
      .catch(requestError => { if (!controller.signal.aborted) setError(requestError.response?.data?.message || 'Unable to load this account’s property records.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedUser]);

  const userOptions = useMemo(() => users.map(user => ({
    value: user._id,
    label: userName(user),
    keywords: [user.username, user.email, user.office, user.division].filter(Boolean).join(' '),
    user,
  })), [users]);

  const rows = useMemo(() => {
    if (!records) return [];
    const issued = (records.risRows || []).filter(row => row.issued && Number(row.quantityIssued) > 0);
    const seen = new Set(issued.map(row => `${idOf(row.risId || row.ris)}:${idOf(row.itemId || row.risItem)}`));
    const transferredIn = (records.assets || []).filter(asset => Number(asset.quantityRemaining ?? Number(asset.quantity) - Number(asset.returnedQuantity || 0)) > 0)
      .filter(asset => !seen.has(`${idOf(asset.ris)}:${idOf(asset.risItem)}`))
      .map(asset => {
        const stock = asset.inventory?.item || {};
        return {
          rowKey: `asset:${asset._id}`,
          stockNumber: stock.displayStockNumber || stock.stockNumber || '',
          propertyNumber: asset.inventory?.propertyNumber || '',
          itemName: stock.name || (stock.category !== 'General' ? stock.category : '') || stock.description || '',
          description: stock.description || stock.name || '',
          quantityIssued: Math.max(0, Number(asset.quantityRemaining ?? Number(asset.quantity) - Number(asset.returnedQuantity || 0))),
          unitCost: Number(asset.inventory?.unitCost || 0),
          recordedAt: asset.issueDate || '',
          risNumber: asset.ris?.risNumber || '',
        };
      });
    return [...issued, ...transferredIn];
  }, [records]);

  const selectUser = option => {
    setSelectedUser(option.user);
    setSearch(option.label);
  };

  return <div className="property-records-page space-y-5">
    <header className="property-records-header">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Property Records</h1>
        <p className="mt-1 text-sm text-slate-600">View items issued to a user account.</p>
      </div>
    </header>

    <section className="property-records-print min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Property records for selected user">
      <div className="property-records-card-header flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="property-records-selection min-w-0 flex-1">
          <p className="property-records-prompt text-sm text-slate-600">Search and select a user account to view its issued property records.</p>
        </div>
        <div className="property-records-search ml-auto w-full sm:w-80">
          <div className="relative">
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <SearchInput id="property-records-user-search" aria-label="Search Employee" placeholder={usersLoading ? 'Loading…' : 'Search Employee'} disabled={usersLoading || Boolean(usersError)} value={search}
              options={userOptions} onChange={value => { setSearch(value); if (selectedUser && value !== userName(selectedUser)) setSelectedUser(null); }} onSelect={selectUser}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          </div>
          {usersError && <p role="alert" className="mt-1 text-xs text-rose-700">{usersError}</p>}
        </div>
      </div>
      <div className="property-records-content p-4 sm:p-5">
        {selectedUser && <div className="property-records-account mb-4"><h2 className="text-lg font-bold text-slate-800">{userName(selectedUser)}</h2><p className="text-sm text-slate-500">{[selectedUser.office, selectedUser.division].filter(Boolean).join(' · ')}</p></div>}
        {loading && <p role="status" className="py-12 text-center text-sm text-slate-500">Loading property records…</p>}
        {error && <p role="alert" className="py-12 text-center text-sm text-rose-700">{error}</p>}
        {selectedUser && !loading && !error && records && <>
          {rows.length ? <TableScroll preserveTable className="overflow-x-auto"><table className="property-records-table w-full min-w-[760px] border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-slate-700"><th className="border border-slate-200 px-3 py-3">Property No.</th><th className="border border-slate-200 px-3 py-3">Item Name</th><th className="border border-slate-200 px-3 py-3">Description</th><th className="border border-slate-200 px-3 py-3">Date Requested</th><th className="border border-slate-200 px-3 py-3 text-right">Amount</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.rowKey || `${row.risId}:${row.itemId}:${index}`} className="even:bg-slate-50/60">
              <td className="border border-slate-200 px-3 py-2.5">{formNumber(row.propertyNumber) || formNumber(risStockNumber(row)) || '—'}</td>
              <td className="border border-slate-200 px-3 py-2.5">{row.itemName || row.description || '—'}</td>
              <td className="border border-slate-200 px-3 py-2.5">{row.description || '—'}</td>
              <td className="border border-slate-200 px-3 py-2.5">{dateLabel(row.recordedAt)}</td>
              <td className="border border-slate-200 px-3 py-2.5 text-right">{amountLabel(Number(row.unitCost || 0) * Number(row.quantityIssued || 0))}</td>
            </tr>)}</tbody>
          </table></TableScroll> : <div className="py-16 text-center text-sm text-slate-500">No issued property records found for this account.</div>}
        </>}
      </div>
      <footer className="property-records-footer flex justify-end border-t border-slate-200 px-5 py-3">
        <button type="button" disabled={!selectedUser || loading || !rows.length} onClick={() => window.print()} className="property-records-print-button inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Printer size={16} aria-hidden="true" />Print</button>
      </footer>
    </section>
  </div>;
}
