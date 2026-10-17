import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Plus, Eye, Pencil, Loader2 } from 'lucide-react';
import UserRecordsDialog from '../components/UserRecordsDialog';

export default function OfflineRecordsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(true);
  const stockRequestPending = useRef(false);
  const [stockError, setStockError] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [requestFor, setRequestFor] = useState(null);
  const [requestedItems, setRequestedItems] = useState({});
  const [search, setSearch] = useState('');
  const load = async () => {
    try { const { data } = await axios.get('/offline-recipients'); setRecords(data.data || []); }
    catch (err) { setError(err.response?.data?.message || 'Unable to load offline records.'); }
    finally { setLoading(false); }
  };
  const loadStock = async () => {
    if (stockRequestPending.current) return;
    stockRequestPending.current = true;
    setStockLoading(true);
    try { const { data } = await axios.get('/items'); setStock(data.data || []); setStockError(''); }
    catch (err) { setStockError(err.response?.data?.message || 'Unable to load available items.'); }
    finally { stockRequestPending.current = false; setStockLoading(false); }
  };
  useEffect(() => {
    load(); loadStock();
    const refresh = () => { if (!document.hidden) loadStock(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const availableItems = stock.filter(item => Number(item.quantityOnHand) > 0);
  const chosenItems = availableItems.filter(item => requestedItems[item._id] !== undefined);
  const validSelection = chosenItems.length > 0 && !stockError && chosenItems.every(item => Number.isInteger(Number(requestedItems[item._id])) && Number(requestedItems[item._id]) > 0 && Number(requestedItems[item._id]) <= Number(item.quantityOnHand));
  const openRequest = record => { setRequestFor(record); setRequestedItems({}); setStockSearch(''); loadStock(); window.requestAnimationFrame(() => document.getElementById('offline-available-items')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  const save = async event => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { await axios[draft._id ? 'put' : 'post'](draft._id ? `/offline-recipients/${draft._id}` : '/offline-recipients', draft); setDraft(null); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Unable to save offline record.'); }
    finally { setSaving(false); }
  };
  return <div className="user-management-page offline-records-page">
    <header className="user-management-header"><div className="user-management-heading"><span className="user-management-eyebrow">OFFICE DIRECTORY / NO LOGIN REQUIRED</span><h1>Offline Records</h1><p>Record office recipients, issued items and confirmed returns without creating login accounts.</p></div><button className="user-create-button" onClick={() => setDraft({ name: '', office: '', designation: '', notes: '' })}><Plus size={16} />Add Offline Record</button></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
    {draft && <form onSubmit={save} className="minimal-surface my-4 space-y-3 p-5"><h2 className="font-semibold">{draft._id ? 'Edit Offline Record' : 'New Offline Record'}</h2>{['name', 'office', 'designation', 'notes'].map(key => <label className="block" key={key}><span className="mb-1 block capitalize">{key === 'name' ? 'Recipient name' : key}</span><input required={key === 'name' || key === 'office'} maxLength={key === 'notes' ? 1000 : 150} value={draft[key] || ''} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} className="w-full rounded-lg border p-2" /></label>)}<div className="flex gap-2"><button disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-white">Save</button><button type="button" disabled={saving} onClick={() => setDraft(null)}>Cancel</button></div></form>}
    <section className="minimal-surface p-5"><input aria-label="Search offline records" placeholder="Search office or recipient" value={search} onChange={event => setSearch(event.target.value)} className="mb-4 w-full rounded-lg border p-2" />{loading ? <p role="status">Loading offline records...</p> : <div className="user-records-table"><table><thead><tr><th>Recipient</th><th>Office</th><th>Designation</th><th>Records</th></tr></thead><tbody>{records.filter(record => `${record.name} ${record.office}`.toLowerCase().includes(search.toLowerCase())).map(record => <tr key={record._id}><td>{record.name}</td><td>{record.office}</td><td>{record.designation || '-'}</td><td><div className="flex flex-wrap gap-3"><button onClick={() => openRequest(record)} className="offline-record-action offline-record-action--request"><Plus size={16} />Request Item</button><button className="offline-record-action offline-record-action--view" onClick={() => setSelected(record)}><Eye size={16} />View Records</button><button className="offline-record-action offline-record-action--edit" onClick={() => setDraft(record)}><Pencil size={16} />Edit</button></div></td></tr>)}</tbody></table>{!records.length && <p className="mt-3">No offline records yet. Add an office and recipient, then select them in RIS.</p>}</div>}</section>
    <section id="offline-available-items" className="minimal-surface mt-5 scroll-mt-6 p-5" aria-labelledby="offline-stock-title">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="offline-stock-title" className="text-lg font-semibold">Available Items{requestFor ? ` - ${requestFor.name} / ${requestFor.office}` : ''}</h2><button type="button" onClick={loadStock} disabled={stockLoading} aria-busy={stockLoading} className="offline-record-action offline-record-action--view disabled:cursor-wait disabled:opacity-70">{stockLoading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{stockLoading ? 'Refreshing...' : 'Refresh Stock'}</button></div>
      <p className="mt-2 text-sm text-slate-600">{requestFor ? 'Select one or more items and enter quantities, then open the requisition form.' : 'Current stock available for requests. Click Request Item beside a recipient to select items.'} Stock is checked again when the admin approves issuance.</p>
      <input aria-label="Search available items" placeholder="Search item or stock number" value={stockSearch} onChange={event => setStockSearch(event.target.value)} className="my-3 w-full rounded-lg border p-2" />
      {stockError && <p role="alert" className="text-rose-700">{stockError}</p>}
      {stockLoading ? <p role="status">Loading available items...</p> : <div className="user-records-table"><table><thead><tr>{requestFor && <th>Select</th>}<th>Item</th><th>Stock Number</th><th>Unit</th><th>Available Quantity</th>{requestFor && <th>Request Quantity</th>}</tr></thead><tbody>{availableItems.filter(item => `${item.description} ${item.stockNumber}`.toLowerCase().includes(stockSearch.toLowerCase())).map(item => <tr key={item._id}>
        {requestFor && <td><input type="checkbox" aria-label={`Select ${item.description}`} checked={requestedItems[item._id] !== undefined} onChange={event => setRequestedItems(previous => { const next = { ...previous }; if (event.target.checked) next[item._id] = 1; else delete next[item._id]; return next; })} /></td>}
        <td>{item.description}</td><td>{item.stockNumber}</td><td>{item.unit}</td><td><span className="rounded-lg bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">{item.quantityOnHand}</span></td>
        {requestFor && <td><input aria-label={`Requested quantity for ${item.description}`} type="number" min="1" max={item.quantityOnHand} step="1" disabled={requestedItems[item._id] === undefined} value={requestedItems[item._id] ?? ''} onChange={event => setRequestedItems(previous => ({ ...previous, [item._id]: event.target.value }))} className="w-24 rounded-lg border p-2" /></td>}
      </tr>)}</tbody></table>{availableItems.length === 0 && <p className="mt-3">No items are currently in stock.</p>}</div>}
      {requestFor && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={!validSelection} className="offline-record-action offline-record-action--request disabled:opacity-50" onClick={() => navigate('/ris', { state: { offlineRequest: requestFor, offlineRequestedItems: chosenItems.map(item => ({ stockNumber: item.stockNumber, description: item.description, unit: item.unit, quantityRequested: Number(requestedItems[item._id]), stockAvailable: Number(item.quantityOnHand) })) } })}>Open Requisition ({chosenItems.length} items)</button><button type="button" onClick={() => { setRequestFor(null); setRequestedItems({}); }} className="offline-record-action offline-record-action--edit">Cancel Selection</button></div>}
    </section>
    {selected && <UserRecordsDialog user={selected} basePath="/offline-recipients" onClose={() => setSelected(null)} />}
  </div>;
}
