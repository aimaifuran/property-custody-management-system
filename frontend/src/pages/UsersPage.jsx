import AccountLockButton from '../components/AccountLockButton';
import Skeleton, { PageSkeleton } from '../components/Skeleton';
import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Pencil, Plus, X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import './UsersPage.css';

const permissionOptions = [
  { key: 'canViewDashboard', label: 'View Dashboard' },
  { key: 'canViewRIS', label: 'View issued items and returns' },
];
const emptyUser = () => ({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });
const avatarColors = ['sage', 'teal', 'olive', 'gold', 'mint', 'slate'];
const avatarColor = user => avatarColors[Array.from(user.username || user._id || '').reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % avatarColors.length];
const initials = user => `${user.firstName?.trim()[0] || ''}${user.lastName?.trim()[0] || ''}`.toUpperCase() || (user.username || 'U').slice(0, 2).toUpperCase();

export default function UsersPage() {
  const { user: currentUser } = useAuth();
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
  const [form, setForm] = useState(emptyUser);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const editorTriggerRef = useRef(null);
  const menuTriggerRef = useRef(null);

  const load = () => axios.get('/users').then(({ data }) => {
    setUsers(data.data || []); setPageLoadError('');
  }).catch(error => {
    setPageLoadError(error.response?.data?.message || 'Unable to load records.');
  }).finally(() => setPageLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('#user-first-name')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (editorTriggerRef.current?.isConnected) editorTriggerRef.current.focus();
    };
  }, [editorOpen]);

  useEffect(() => {
    if (!openMenu) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const dismiss = event => {
      if (!event.target.closest('.user-card-actions')) setOpenMenu(null);
    };
    const keyboard = event => {
      if (event.key === 'Escape') { setOpenMenu(null); menuTriggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', keyboard); };
  }, [openMenu]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const { data } = await axios.get('/users/password-reset-requests', { signal: controller.signal });
        setResetRequests(data.data); setRequestError('');
      } catch { if (!controller.signal.aborted) setRequestError('Unable to load password recovery requests.'); }
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
    if (saving || currentUser?.role !== 'admin') return;
    setSaving(true); setSaveError('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      const { data } = editingUser ? await axios.put(`/users/${editingUser._id}`, payload) : await axios.post('/users', payload);
      setUsers(previous => editingUser ? previous.map(account => account._id === editingUser._id ? data.data : account) : [data.data, ...previous]);
      toast.success(editingUser ? 'User access updated' : 'User created');
      setEditingUser(null);
      setForm(emptyUser());
      setEditorOpen(false);
      setPage(1);
    } catch (error) {
      const message = error.response?.data?.message || 'Unable to save user';
      setSaveError(message);
      toast.error(message);
    }
    finally { setSaving(false); }
  };

  const editUser = (user, event) => {
    editorTriggerRef.current = event.currentTarget.closest('.user-account-record')?.querySelector('.user-card-menu-toggle');
    setOpenMenu(null); setSaveError('');
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
    setEditorOpen(true);
  };

  const createUser = event => {
    editorTriggerRef.current = event.currentTarget;
    setEditingUser(null); setForm(emptyUser()); setSaveError(''); setOpenMenu(null);
    setEditorOpen(true);
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditingUser(null);
    setForm(emptyUser()); setSaveError(''); setEditorOpen(false);
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

  const pageSize = 12;
  const pagedUsers = users.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));

  if (pageLoading) return <PageSkeleton />;
  if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={() => { setPageLoading(true); setPageLoadError(''); load(); }} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
    <div className="user-management-page">
      <header className="user-management-header">
        <div><h1>User Management</h1><p>Manage your office accounts.</p></div>
        {currentUser?.role === 'admin' && <button type="button" className="user-create-button" aria-haspopup="dialog" aria-expanded={editorOpen && !editingUser} onClick={createUser}><Plus size={16} aria-hidden="true" /> Create User</button>}
      </header>
      <section className="user-account-grid" aria-label="Office accounts">
        {pagedUsers.map(user => <article key={user._id} className="user-account-record">
          <div className={`user-card-avatar user-card-avatar--${avatarColor(user)}`} aria-hidden="true">{initials(user)}</div>
          <div className="user-card-details">
            <h2>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.username}</h2>
            <p className="user-card-username" title={user.email}>@{user.username}</p>
            <p className="user-card-office">{user.office || user.division}</p>
            <div className="user-card-labels"><span className={`user-role user-role--${user.role}`}>{user.role === 'admin' ? 'Admin' : 'User'}</span>{user.locked && <span className="user-locked-label">Locked</span>}</div>
          </div>
          {currentUser?.role === 'admin' && <div className="user-card-actions" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(previous => previous === user._id ? null : previous); }}>
            <button type="button" className="user-card-menu-toggle" aria-label={`Actions for ${user.username}`} aria-expanded={openMenu === user._id} aria-controls={`user-actions-${user._id}`} onClick={event => { menuTriggerRef.current = event.currentTarget; setOpenMenu(previous => previous === user._id ? null : user._id); }}><MoreVertical size={18} aria-hidden="true" /></button>
            {openMenu === user._id && <div ref={menuRef} id={`user-actions-${user._id}`} className="user-card-menu" role="group" aria-label={`Account actions for ${user.username}`}>
              <button type="button" onClick={event => editUser(user, event)}><Pencil size={15} aria-hidden="true" /> Edit user</button>
              <div className="user-card-lock"><span>{user.locked ? 'Unlock account' : 'Lock account'}</span><AccountLockButton locked={user.locked} username={user.username || user.email} busy={lockingUser === user._id} disabled={!!lockingUser} onClick={() => toggleLock(user)} /></div>
            </div>}
          </div>}
        </article>)}
      </section>
      {users.length === 0 && <div className="user-accounts-empty"><h2>No office accounts yet</h2><p>Click Create User to add an account.</p></div>}
      {users.length > pageSize && <nav className="user-management-pagination" aria-label="Account pages"><span>Page {page} of {pageCount}</span><div><button type="button" disabled={page === 1} onClick={() => { setPage(value => value - 1); setOpenMenu(null); }}>Previous</button><button type="button" disabled={page === pageCount} onClick={() => { setPage(value => value + 1); setOpenMenu(null); }}>Next</button></div></nav>}
      {editorOpen && <dialog ref={dialogRef} role="dialog" className="user-editor-dialog" aria-labelledby="user-editor-title" onCancel={event => { event.preventDefault(); cancelEdit(); }}>
        <form onSubmit={save}>
        <div className="user-editor-heading">
          <div><h2 id="user-editor-title">{editingUser ? 'Edit User Access' : 'Create User'}</h2><p>{editingUser ? 'Update account details and access.' : 'Add a member of your office.'}</p></div>
          <button type="button" className="user-editor-close" onClick={cancelEdit} disabled={saving} aria-label="Close user form"><X size={18} aria-hidden="true" /></button>
        </div>
        {saveError && <p className="user-editor-error" role="alert">{saveError}</p>}
        <fieldset disabled={saving}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">First Name</span>
            <input id="user-first-name" aria-label="First Name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="First Name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Last Name</span>
            <input id="user-last-name" aria-label="Last Name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Last Name" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input id="user-email" aria-label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Email" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Username</span>
            <input id="user-username" aria-label="Username" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Username" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Password</span>
            <input id="user-password" aria-label="Password" type="password" autoComplete="new-password" required={!editingUser} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder={editingUser ? 'Leave blank to keep password' : 'Password'} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Office</span>
            <input id="user-office" aria-label="Office" required value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Office" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Division</span>
            <input id="user-division" aria-label="Division" required value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Division" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Role</span>
            <select id="user-role" aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2">
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
                  disabled={form.role === 'user' && permission.key === 'canViewRIS'}
                  checked={form.role === 'user' && permission.key === 'canViewRIS' || form.permissions.includes(permission.key)}
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
        </fieldset>
        <div className="user-editor-footer"><button type="button" disabled={saving} onClick={cancelEdit}>Cancel</button><button type="submit" disabled={saving} className="user-editor-save">{saving ? 'Saving...' : editingUser ? 'Save User Access' : 'Create User'}</button></div>
        </form>
      </dialog>}
      {(requestLoading || requestError || resetRequests.length > 0) && <section className="user-password-requests minimal-surface" aria-label="Password recovery notifications">
        <h2>Password Reset Requests</h2>
        <p>Review requests for a password reset link.</p>
        {requestLoading ? <Skeleton className="mt-3 h-4 w-48" /> : requestError ? <p role="alert" className="mt-3 text-rose-700">{requestError}</p> : <div className="mt-3 space-y-3">{resetRequests.map(request => <div key={request._id} className="saved-record flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div><strong>{request.user.firstName} {request.user.lastName}</strong><p>{request.user.username} · {request.user.email}</p><p className="text-slate-500">{new Date(request.createdAt).toLocaleString()} · {request.status === 'APPROVED' ? 'Approved · reset email sent' : request.status === 'SENDING' ? 'Approval in progress' : 'Awaiting your approval'}</p></div>
          {request.status === 'PENDING' && <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!reviewing} onClick={() => reviewReset(request, 'approve')} className="rounded-lg bg-emerald-700 text-white">{reviewing === request._id ? <Skeleton className="h-4 w-16" /> : 'Approve'}</button>
            <input aria-label={`Rejection reason for ${request.user.username}`} placeholder="Reason (optional)" maxLength={500} value={reasons[request._id] || ''} onChange={event => setReasons(previous => ({ ...previous, [request._id]: event.target.value }))} className="min-w-0 rounded-lg border px-2 py-1" />
            <button type="button" disabled={!!reviewing} onClick={() => reviewReset(request, 'reject')} className="rounded-lg bg-rose-100 text-rose-700">{reviewing === request._id ? <Skeleton className="h-4 w-16" /> : 'Reject'}</button>
          </div>}
        </div>)}</div>}
      </section>}
    </div>
  );
}
