import { Link } from 'react-router-dom';
import usePendingReturns, { returnRequestUserId } from '../utils/usePendingReturns';
import { useEffect, useRef, useState } from 'react';
import { Eye, X, RotateCcw, CircleCheck } from 'lucide-react';
import axios from 'axios';
import { mergeAccountItems } from '../utils/accountItems';
import { groupAccountItems, allocateAccountReturn } from '../utils/groupAccountItems';

const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString() : '—';

export default function UserRecordsDialog({ user, onClose, basePath = '/users' }) {
  const pendingReturns = usePendingReturns();
  const userRequests = pendingReturns.filter(request => returnRequestUserId(request) === String(user._id));
  const dialogRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [returnQuantities, setReturnQuantities] = useState({});
  const [returnConditions, setReturnConditions] = useState({});
  const [returning, setReturning] = useState('');
  const [returnError, setReturnError] = useState('');
  const returnLock = useRef(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get(`${basePath}/${user._id}/records`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRows(mergeAccountItems(data.data)); })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load user records.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user._id, attempt, basePath]);
  const markReturned = async row => {
    if (returnLock.current) return;
    const quantity = Number(returnQuantities[row.rowKey] ?? row.returnableQuantity);
    const condition = returnConditions[row.rowKey];
    if (!condition || !Number.isInteger(quantity) || quantity <= 0 || quantity > row.returnableQuantity) { setReturnError('Choose Serviceable or Unserviceable and enter a return quantity within the remaining balance.'); return; }
    returnLock.current = true;
    setReturning(row.rowKey); setReturnError('');
    try {
      for (const { member, quantity: amount } of allocateAccountReturn(row, quantity)) {
        await axios.post(`${basePath}/${user._id}/records/returned`, { accountability: member.accountability, risId: member.risId, itemId: member.itemId, quantity: amount, condition, expectedRemaining: member.quantityRemaining });
      }
      const { data } = await axios.get(`${basePath}/${user._id}/records`);
      setRows(mergeAccountItems(data.data));
      setReturnQuantities(previous => { const next = { ...previous }; delete next[row.rowKey]; return next; });
      setReturnConditions(previous => { const next = { ...previous }; delete next[row.rowKey]; return next; });
    } catch (error) {
      setReturnError(error.response?.data?.message || 'Unable to finish recording the return. Review the refreshed balances before retrying.');
      try { const { data } = await axios.get(`${basePath}/${user._id}/records`); setRows(mergeAccountItems(data.data)); setReturnQuantities({}); } catch { setAttempt(value => value + 1); }
    }
    finally { returnLock.current = false; setReturning(''); }
  };
  const requests = rows.filter(row => !row.issued && Number(row.quantityRequested) > 0);
  const issued = groupAccountItems(rows.filter(row => row.issued && row.quantityRemaining > 0));
  const returned = rows.flatMap(row => (row.returns || []).filter(receipt => receipt.status === 'RETURNED').map((receipt, index) => ({ ...receipt, itemName: row.itemName || row.description, documentNumber: row.documentNumber || row.risNumber, key: `${row.rowKey}:${index}` })));
  return <dialog ref={dialogRef} className="user-records-dialog" aria-labelledby="user-records-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="user-editor-heading">
      <div><h2 id="user-records-title">View Records</h2><p>{user.name || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ')}{user.username ? ` / @${user.username}` : ' / Offline recipient'}</p><p>{user.office}</p></div>
      <button type="button" className="user-editor-close" aria-label="Close user records" onClick={onClose}><X size={18} /></button>
    </div>
    {userRequests.length > 0 && <section className="rounded-lg border border-red-200 p-4"><h3 className="font-semibold">Awaiting Return Confirmation ({userRequests.length})</h3>{userRequests.map(request => <div key={request._id} className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="min-w-0 break-words">{request.prsNumber}: {request.items.map(item => item.description || item.propertyNumber).join(', ')}</p><Link to={`/returns?record=${request._id}`} onClick={onClose} className="ml-auto inline-block shrink-0 rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700">Review Return Request</Link></div>)}</section>}
    <p className="user-records-notice"><Eye size={16} aria-hidden="true" /> Enter the quantity received and choose Serviceable or Unserviceable before clicking Returned. Serviceable items go back to available stock; unserviceable items stay in return history and are excluded from available stock.</p>
    {returnError && <p role="alert" className="text-rose-700">{returnError}</p>}
    {loading ? <p role="status">Loading user records...</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>
      {requests.length > 0 && <section aria-labelledby="offline-request-title"><h3 id="offline-request-title">Pending / Recorded Requests <span>{requests.length}</span></h3><div className="user-records-table"><table className="user-records-request-table"><thead><tr><th>Item</th><th>RIS</th><th>Requested quantity</th><th>Status</th><th>Return eligibility</th></tr></thead><tbody>{requests.map(row => <tr key={row.rowKey}><td>{row.itemName || row.description}</td><td>{row.risNumber}</td><td>{row.quantityRequested}</td><td><div className="user-records-request-status"><span className="inline-flex rounded-lg bg-amber-100 px-3 py-1 font-semibold text-amber-800">{row.requestStatus === 'REJECTED' ? 'Request Rejected' : row.requestStatus === 'APPROVED' ? 'Approved - Awaiting Issuance' : 'Pending Request'}</span><small className="user-records-request-status-note">{row.status}</small></div></td><td>Not returnable until approved and issued</td></tr>)}</tbody></table></div></section>}
      <section aria-labelledby="user-issued-title"><h3 id="user-issued-title">Issued items <span>{issued.length}</span></h3>
        {!issued.length ? <p className="user-records-empty">No issued items recorded for this account.</p> : <div className="user-records-table"><table className="user-records-issued-table"><thead><tr><th>Item</th><th>Document</th><th>Issued</th><th>Remaining</th><th>Date issued</th><th>Status</th><th className="user-records-quantity-column">Return quantity</th><th className="user-records-actions-column">Actions</th></tr></thead><tbody>{issued.map(row => <tr key={row.rowKey}><td data-label="Item">{row.itemName || row.description}<small>{row.stockNumber}</small></td><td data-label="Document">{row.documentNumber || row.risNumber || '—'}</td><td data-label="Issued">{row.quantityIssued ?? '—'}</td><td data-label="Remaining">{row.quantityRemaining}</td><td data-label="Date issued">{dateText(row.issuedAt)}</td><td data-label="Status">{row.status}</td><td data-label="Return quantity" className="user-records-quantity-column"><input aria-label={`Return quantity for ${row.itemName || row.description}`} type="number" min="1" max={row.returnableQuantity} step="1" disabled={!!returning || row.pendingReturn || row.historyOnly} value={returnQuantities[row.rowKey] ?? row.returnableQuantity} onChange={event => setReturnQuantities(previous => ({ ...previous, [row.rowKey]: event.target.value }))} className="user-records-quantity-input rounded-lg border p-2" /></td><td data-label="Actions" className="user-records-actions-column"><div className="user-records-return-actions"><div className="user-records-condition-actions" role="group" aria-label={`Returned condition for ${row.itemName || row.description}`}>{['Serviceable', 'Unserviceable'].map(condition => <button key={condition} type="button" disabled={!!returning || row.pendingReturn || row.historyOnly} aria-pressed={returnConditions[row.rowKey] === condition} onClick={() => setReturnConditions(previous => ({ ...previous, [row.rowKey]: condition }))} className={`user-records-condition-button ${condition === 'Unserviceable' ? 'user-records-condition-button--unserviceable' : ''}`}>{condition}</button>)}</div><button type="button" disabled={!!returning || !returnConditions[row.rowKey] || row.returnableQuantity <= 0 || row.pendingReturn || row.historyOnly} onClick={() => markReturned(row)} className="user-records-return-button"><RotateCcw size={16} aria-hidden="true" />{returning === row.rowKey ? 'Recording...' : 'Returned'}</button></div></td></tr>)}</tbody></table></div>}
      </section>
      <section aria-labelledby="user-returned-title"><h3 id="user-returned-title">Returned items <span>{returned.length}</span></h3>
        {!returned.length ? <p className="user-records-empty">No confirmed returns recorded for this account.</p> : <div className="user-records-table"><table className="user-records-returned-table"><thead><tr><th>Item</th><th>Issue document</th><th>Return document</th><th>Quantity</th><th>Date returned</th><th>Received by</th><th>Condition</th><th>Status</th></tr></thead><tbody>{returned.map(row => <tr key={row.key}><td>{row.itemName}</td><td>{row.documentNumber || '—'}</td><td>{row.prsNumber || '—'}</td><td>{row.quantity}</td><td>{dateText(row.date)}</td><td>{row.receivedBy || '—'}</td><td>{row.condition || 'Not recorded'}</td><td><span className="user-records-return-success"><CircleCheck size={16} aria-hidden="true" />Successfully returned</span></td></tr>)}</tbody></table></div>}
      </section>
    </>}
    <div className="user-editor-footer"><button type="button" onClick={onClose}>Close</button></div>
  </dialog>;
}
