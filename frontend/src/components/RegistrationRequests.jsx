import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function RegistrationRequests({ onApproved }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState('');
  const [reasons, setReasons] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const { data } = await axios.get('/registration', { signal: controller.signal });
        if (!controller.signal.aborted) { setRequests(data.data || []); setError(''); }
      } catch { if (!controller.signal.aborted) setError('Unable to load registration requests.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [attempt]);
  const review = async (request, action) => {
    if (reviewing) return;
    setReviewing(request._id); setError('');
    try {
      const { data } = await axios.post(`/registration/${request._id}/${action}`, { reason: reasons[request._id] || '' });
      toast.success(data.message);
      setRequests(previous => previous.filter(row => row._id !== request._id));
      if (action === 'approve') onApproved?.();
      window.dispatchEvent(new Event('registration-updated'));
    } catch (error) { setError(error.response?.data?.message || 'Unable to review registration request.'); }
    finally { setReviewing(''); }
  };
  return <section className="registration-requests minimal-surface" aria-labelledby="registration-requests-title">
    <h2 id="registration-requests-title">Registration Requests</h2><p>Review office and position details before approving account access.</p>
    {error && <div role="alert" className="mt-3 text-rose-700">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {loading ? <p role="status" className="mt-4 text-slate-500">Loading requests...</p> : requests.length === 0 ? <p className="mt-4 text-slate-500">No pending registration requests.</p> : <div className="mt-4 space-y-4">{requests.map(request => <article key={request._id} className="registration-request-card">
      <div><h3>{[request.firstName, request.middleName, request.lastName].filter(Boolean).join(' ')}</h3><p>@{request.username} · {request.email}</p><dl><div><dt>Office</dt><dd>{request.office}</dd></div><div><dt>Division / Unit</dt><dd>{request.division}</dd></div><div><dt>LGU Position</dt><dd>{request.position}</dd></div></dl><p className="text-xs text-slate-400">Submitted {new Date(request.createdAt).toLocaleString()}</p></div>
      <div className="registration-review-actions"><button type="button" disabled={!!reviewing} className="registration-approve" onClick={() => review(request, 'approve')}>{reviewing === request._id ? 'Processing...' : 'Approve'}</button><input aria-label={`Rejection reason for registration ${request.username}`} placeholder="Rejection reason (optional)" maxLength={500} value={reasons[request._id] || ''} onChange={event => setReasons(previous => ({ ...previous, [request._id]: event.target.value }))} /><button type="button" disabled={!!reviewing} onClick={() => review(request, 'reject')}>Reject</button></div>
    </article>)}</div>}
  </section>;
}
