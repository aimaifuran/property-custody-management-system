import { useEffect, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
import axios from 'axios';
import { mergeAccountItems } from '../utils/accountItems';

const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString() : '—';

export default function UserRecordsDialog({ user, onClose }) {
  const dialogRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
    axios.get(`/users/${user._id}/records`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRows(mergeAccountItems(data.data)); })
      .catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Unable to load user records.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user._id, attempt]);
  const issued = rows.filter(row => row.issued && row.quantityIssued !== 0);
  const returned = rows.flatMap(row => (row.returns || []).filter(receipt => receipt.status === 'RETURNED').map((receipt, index) => ({ ...receipt, description: row.description, documentNumber: row.documentNumber || row.risNumber, key: `${row.rowKey}:${index}` })));
  return <dialog ref={dialogRef} className="user-records-dialog" aria-labelledby="user-records-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="user-editor-heading">
      <div><h2 id="user-records-title">View Records</h2><p>{[user.firstName, user.lastName].filter(Boolean).join(' ')} · @{user.username}</p><p>{user.office}</p></div>
      <button type="button" className="user-editor-close" aria-label="Close user records" onClick={onClose}><X size={18} /></button>
    </div>
    <p className="user-records-notice"><Eye size={16} aria-hidden="true" /> Read-only · Issued items and confirmed returns</p>
    {loading ? <p role="status">Loading user records...</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : <>
      <section aria-labelledby="user-issued-title"><h3 id="user-issued-title">Issued items <span>{issued.length}</span></h3>
        {!issued.length ? <p className="user-records-empty">No issued items recorded for this account.</p> : <div className="user-records-table"><table><thead><tr><th>Item</th><th>Document</th><th>Issued</th><th>Returned</th><th>Remaining</th><th>Date issued</th><th>Status</th></tr></thead><tbody>{issued.map(row => <tr key={row.rowKey}><td>{row.description}<small>{row.stockNumber}</small></td><td>{row.documentNumber || row.risNumber || '—'}</td><td>{row.quantityIssued ?? '—'}</td><td>{row.quantityReturned}</td><td>{row.quantityRemaining}</td><td>{dateText(row.issuedAt)}</td><td>{row.status}</td></tr>)}</tbody></table></div>}
      </section>
      <section aria-labelledby="user-returned-title"><h3 id="user-returned-title">Returned items <span>{returned.length}</span></h3>
        {!returned.length ? <p className="user-records-empty">No confirmed returns recorded for this account.</p> : <div className="user-records-table"><table><thead><tr><th>Item</th><th>Issue document</th><th>Return document</th><th>Quantity</th><th>Date returned</th><th>Received by</th></tr></thead><tbody>{returned.map(row => <tr key={row.key}><td>{row.description}</td><td>{row.documentNumber || '—'}</td><td>{row.prsNumber || '—'}</td><td>{row.quantity}</td><td>{dateText(row.date)}</td><td>{row.receivedBy || '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
    <div className="user-editor-footer"><button type="button" onClick={onClose}>Close</button></div>
  </dialog>;
}
