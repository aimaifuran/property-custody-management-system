import AccountLockButton from '../components/AccountLockButton';
import Skeleton, { PageSkeleton } from '../components/Skeleton';
import RecordActionButton from '../components/RecordActionButton';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const permissionOptions = [
  { key: 'canViewDashboard', label: 'View Dashboard' },
  { key: 'canViewRIS', label: 'View own requests, issued items and returns' },
];

export default function UsersPage() {
  const [pageLoading, setPageLoading] = useState(true);
  const [pageLoadError, setPageLoadError] = useState('');

  const [resetRequests, setResetRequests] = useState([]);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState('');
  const [lockingUser, setLockingUser] = useState('');
  const [reviewing, setReviewing] = useState('');
  const [reasons, setReasons] = useState({});
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });

  const load = async () => {
    setPageLoading(true);
    setPageLoadError('');
    try {

    const { data } = await axios.get('/users');
    setUsers(data.data || []);

    } catch (error) {
      setPageLoadError(error.response?.data?.message || 'Unable to load records.');
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const { data } = await axios.get('/users/password-reset-requests', { signal: controller.signal });
        setResetRequests(data.data); setRequestError('');
      } catch (error) { if (!controller.signal.aborted) setRequestError('Unable to load password recovery requests.'); }
      finally { if (!controller.signal.aborted) setRequestLoading(false); }
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  const reviewReset = async (request, action) => {
    setReviewing(request._id);
    try {
      const { data } = await axios.post(`/users/password-reset-requests/${request._id}/${action}`, { reason: reasons[request._id] || '' });
      toast.success(data.message);
      const result = await axios.get('/users/password-reset-requests');
      setResetRequests(result.data.data);
      window.dispatchEvent(new Event('password-recovery-updated'));
    } catch (error) { toast.error(error.response?.data?.message || 'Unable to review request'); }
    finally { setReviewing(''); }
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editingUser) {
        await axios.put(`/users/${editingUser._id}`, payload);
        toast.success('User access updated');
      } else {
        await axios.post('/users', payload);
        toast.success('User created');
      }
      await load();
      setEditingUser(null);
      setForm({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });
      setPage(1);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save user');
    }
  };

  const editUser = (user) => {
    setEditingUser(user);
    setForm({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      username: user.username || '',
      password: '',
      office: user.office || '',
      division: user.division || '',
      role: user.role || 'user',
      permissions: user.permissions || [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setForm({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });
  };

  const toggleLock = async (user) => {
    if (lockingUser) return;
    setLockingUser(user._id);
    try {
      const { data } = await axios.patch(`/users/${user._id}/lock`, { locked: !user.locked });
      setUsers(previous => previous.map(account => account._id === user._id ? { ...account, locked: data.data.locked } : account));
      toast.success(user.locked ? 'User unlocked' : 'User locked');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to change lock status');
    } finally { setLockingUser(''); }
  };

  const pageSize = 6;
  const pagedUsers = users.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));

  if (pageLoading) return <PageSkeleton />;
  if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={load} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">User Management</h1>
        <p className="text-sm text-slate-500">Create users and manage role-based access.</p>
      </div>
      <section className="minimal-surface p-4" aria-label="Password recovery notifications">
        <h2 className="font-semibold">Password Reset Requests</h2>
        <p className="mt-1 text-slate-500">Approve a request to email a reset link to the user's registered address.</p>
        {requestLoading ? <PageSkeleton /> : requestError ? <p role="alert" className="mt-3 text-rose-700">{requestError}</p> : resetRequests.length === 0 ? <p className="mt-3 text-slate-500">No password reset requests awaiting review.</p> : <div className="mt-3 space-y-3">{resetRequests.map(request => <div key={request._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div><strong>{request.user.firstName} {request.user.lastName}</strong><p>{request.user.username} ? {request.user.email}</p><p className="text-slate-500">{new Date(request.createdAt).toLocaleString()} ? {request.status === 'APPROVED' ? 'Approved ? reset email sent' : request.status === 'SENDING' ? 'Approval in progress' : 'Awaiting your approval'}</p></div>
          {request.status === 'PENDING' && <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!reviewing} onClick={() => reviewReset(request, 'approve')} className="rounded-lg bg-emerald-700 text-white">{reviewing === request._id ? <Skeleton className="h-4 w-16" /> : 'Approve'}</button>
            <input aria-label={`Rejection reason for ${request.user.username}`} placeholder="Reason (optional)" maxLength={500} value={reasons[request._id] || ''} onChange={event => setReasons(previous => ({ ...previous, [request._id]: event.target.value }))} className="min-w-0 rounded-lg border px-2 py-1" />
            <button type="button" disabled={!!reviewing} onClick={() => reviewReset(request, 'reject')} className="rounded-lg bg-rose-100 text-rose-700">{reviewing === request._id ? <Skeleton className="h-4 w-16" /> : 'Reject'}</button>
          </div>}
        </div>)}</div>}
      </section>
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{editingUser ? 'Edit User Access' : 'Create User'}</h2>
          {editingUser && <button type="button" onClick={cancelEdit} className="rounded-md border px-3 py-2 text-sm">Cancel</button>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">First Name</span>
            <input id="user-first-name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="First Name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Last Name</span>
            <input id="user-last-name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Last Name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input id="user-email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Email" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Username</span>
            <input id="user-username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Username" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
            <input id="user-password" required={!editingUser} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder={editingUser ? 'Leave blank to keep password' : 'Password'} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Office</span>
            <input id="user-office" required value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Office" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Division</span>
            <input id="user-division" required value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Division" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Role</span>
            <select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-700">Page Access</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {permissionOptions.map((permission) => (
              <label key={permission.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.permissions.includes(permission.key)}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      permissions: e.target.checked
                        ? [...new Set([...prev.permissions, permission.key])]
                        : prev.permissions.filter((value) => value !== permission.key),
                    }));
                  }}
                  className="h-4 w-4"
                />
                {permission.label}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-white">{editingUser ? 'Save User Access' : 'Create User'}</button>
      </motion.form>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-3">
          {pagedUsers.map((user) => (
            <div key={user._id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-semibold">{user.firstName} {user.lastName}</div><div className="text-sm text-slate-500">{user.email} · {user.role}</div></div>
                <div className="flex gap-2">
                  <RecordActionButton action="edit" onClick={() => editUser(user)} />
                  <AccountLockButton locked={user.locked} username={user.username || user.email} busy={lockingUser === user._id} disabled={!!lockingUser} onClick={() => toggleLock(user)} />
                </div>
              </div>
            </div>
          ))}
          {users.length > 0 && <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>}
        </div>
      </div>
    </div>
  );
}
