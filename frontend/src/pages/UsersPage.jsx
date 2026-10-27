import OfficeSelect from '../components/OfficeSelect';
import RegistrationRequests from '../components/RegistrationRequests';
import UserRecordsDialog from '../components/UserRecordsDialog';
import ValidatedForm from '../components/ValidatedForm';
import AccountLockButton from '../components/AccountLockButton';
import Skeleton, { PageSkeleton } from '../components/Skeleton';
import { useEffect, useRef, useState } from 'react';
import { Building2, Camera, Eye, Mail, MoreVertical, Pencil, Plus, ShieldCheck, X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import AccountNotificationToaster from '../components/AccountNotificationToaster';
import { useAuth } from '../contexts/AuthContext';
import './UsersPage.css';

const emptyUser = () => ({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS'] });
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
  const [openMenu, setOpenMenu] = useState(null);
  const [recordsUser, setRecordsUser] = useState(null);
  const recordsTriggerRef = useRef(null);
  const dialogRef = useRef(null);
  const menuRef = useRef(null);
  const editorTriggerRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const pictureInputRef = useRef(null);
  const pictureUserRef = useRef(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  const uploadUserPicture = async event => {
    const file = event.target.files?.[0];
    const account = pictureUserRef.current;
    event.target.value = '';
    if (!file || !account || uploadingPicture) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error('Choose a JPG, PNG, or WebP image, 2 MB or smaller.'); return;
    }
    setUploadingPicture(true);
    try {
      const payload = new FormData(); payload.append('picture', file);
      const { data } = await axios.post(`/users/${account._id}/profile-picture`, payload);
      setUsers(previous => previous.map(user => user._id === account._id ? { ...user, profilePicture: data.data.profilePicture } : user));
      toast.success(`Profile picture updated for ${account.username}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to upload profile picture.');
    } finally { setUploadingPicture(false); }
  };

  const load = () => axios.get('/users', { params: { role: 'user' } }).then(({ data }) => {
    setUsers((data.data || []).filter(account => account.role === 'user')); setPageLoadError('');
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
    setSaving(true); 
    try {
      const role = editingUser ? editingUser.role : form.role;
      const payload = { ...form, role, permissions: role === 'admin' ? [] : ['canViewRIS'] };
      if (!payload.password) delete payload.password;
      const { data } = editingUser ? await axios.put(`/users/${editingUser._id}`, payload) : await axios.post('/users', payload);
      await load();
      toast.success(editingUser ? 'Account details updated' : role === 'admin' ? 'Administrator account created' : 'User created', { toasterId: 'account-feedback' });
      setEditingUser(null);
      setForm(emptyUser());
      setEditorOpen(false);
      setPage(1);
    } catch (error) {
      const message = error.response?.data?.message || 'Unable to save user';
      
      toast.error(message, { toasterId: 'user-editor', id: 'user-save-error' });
    }
    finally { setSaving(false); }
  };

  const editUser = (user, event) => {
    editorTriggerRef.current = event.currentTarget.closest('.user-account-record')?.querySelector('.user-card-menu-toggle');
    setOpenMenu(null); 
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
    setEditingUser(null); setForm(emptyUser());  setOpenMenu(null);
    setEditorOpen(true);
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditingUser(null);
    setForm(emptyUser());  setEditorOpen(false);
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

  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedUsers = users.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (pageLoading) return <PageSkeleton />;
  if (pageLoadError) return <div role="alert" className="minimal-surface p-4">{pageLoadError}<button type="button" onClick={() => { setPageLoading(true); setPageLoadError(''); load(); }} className="ml-3 rounded-lg border px-3 py-2">Retry</button></div>;
 return (
    <div className="user-management-page">
      <input ref={pictureInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose user profile picture" hidden onChange={uploadUserPicture} disabled={uploadingPicture} />
      {uploadingPicture && <p role="status">Saving user profile picture...</p>}
      <header className="user-management-header">
        <div className="user-management-heading"><span className="user-management-eyebrow"><ShieldCheck size={14} aria-hidden="true" /> ACCOUNT DIRECTORY</span><h1>User Management</h1><p>Your team, their offices, and the access they need.</p></div>
        {currentUser?.role === 'admin' && <div className="user-management-create-actions"><button type="button" className="user-create-button" aria-haspopup="dialog" aria-expanded={editorOpen && !editingUser} onClick={createUser}><Plus size={16} aria-hidden="true" /> Add User</button></div>}
      </header>
      {currentUser?.role === 'admin' && <RegistrationRequests onApproved={load} />}
      <h2 className="account-section-heading">User accounts</h2>
      <section className="user-account-grid" aria-label="Office accounts">
        {pagedUsers.map(user => <article key={user._id} className="user-account-record">
          <div className={`user-card-avatar user-card-avatar--${avatarColor(user)} account-directory-picture`} aria-hidden="true">{user.profilePicture ? <img src={user.profilePicture} alt="" /> : initials(user)}</div>
          <div className="user-card-details">
            <h2>{[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.username}</h2>
            <p className="user-card-email"><Mail size={14} aria-hidden="true" /><span>{user.email || 'Email not recorded'}</span></p>
            <p className="user-card-office"><Building2 size={14} aria-hidden="true" /><span>{user.office || 'Office not assigned'}</span></p>
          </div>
          {currentUser?.role === 'admin' && <div className="user-card-actions" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(previous => previous === user._id ? null : previous); }}>
            <button type="button" className="user-card-menu-toggle relative" aria-label={`Actions for ${user.username}`} aria-expanded={openMenu === user._id} aria-controls={`user-actions-${user._id}`} onClick={event => { menuTriggerRef.current = event.currentTarget; setOpenMenu(previous => previous === user._id ? null : user._id); }}><MoreVertical size={18} aria-hidden="true" /></button>
            {openMenu === user._id && <div ref={menuRef} id={`user-actions-${user._id}`} className="user-card-menu" role="group" aria-label={`Account actions for ${user.username}`}>
              <button type="button" onClick={() => { recordsTriggerRef.current = menuTriggerRef.current; setOpenMenu(null); setRecordsUser(user); }}><Eye size={16} aria-hidden="true" /> View Records</button>
                    <button type="button" onClick={event => editUser(user, event)}><Pencil size={15} aria-hidden="true" /> Edit user</button>
              <button type="button" disabled={uploadingPicture} onClick={() => { pictureUserRef.current = user; pictureInputRef.current?.click(); setOpenMenu(null); }}><Camera size={16} aria-hidden="true" /> {user.profilePicture ? 'Change profile photo' : 'Upload profile photo'}</button>
              <div className="user-card-lock"><span>{user.status === 'inactive' ? 'Inactive account' : user.locked ? 'Unlock account' : 'Lock account'}</span><AccountLockButton locked={user.locked} username={user.username || user.email} busy={lockingUser === user._id} disabled={!!lockingUser || user.status === 'inactive'} onClick={() => toggleLock(user)} /></div>
            </div>}
          </div>}
        </article>)}
      </section>
      {users.length === 0 && <div className="user-accounts-empty"><h2>No office accounts yet</h2><p>Click Add User to add an account.</p></div>}
      {users.length > pageSize && <nav className="user-management-pagination" aria-label="Account pages"><span>Page {currentPage} of {pageCount}</span><div><button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setOpenMenu(null); }}>Previous</button><button type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setOpenMenu(null); }}>Next</button></div></nav>}

      {recordsUser && <UserRecordsDialog user={recordsUser} onClose={() => { setRecordsUser(null); window.requestAnimationFrame(() => recordsTriggerRef.current?.focus()); }} />}
      {editorOpen && <dialog ref={dialogRef} role="dialog" className="user-editor-dialog" aria-labelledby="user-editor-title" onCancel={event => { event.preventDefault(); cancelEdit(); }}>
        <AccountNotificationToaster toasterId="user-editor" />
        <ValidatedForm onSubmit={save} onValidationError={errors => {
          const first = errors[0];
          const message = first.field.type === 'email' && first.field.validity.typeMismatch
            ? 'Email: enter a valid email address. Special characters such as ñ are not accepted by this email field. Use the exact address registered with your email provider.'
            : `${first.label}: ${first.message}`;
          
          toast.error(message, { id: 'user-form-validation', toasterId: 'user-editor' });
        }}>
        <div className="user-editor-heading">
          <div><h2 id="user-editor-title">{editingUser ? editingUser.role === 'admin' ? 'Edit Administrator Account' : 'Edit User Access' : 'Add User'}</h2><p>{editingUser ? 'Update email or set a new password. Leave password blank to keep it.' : 'Add a member of your office.'}</p></div>
          <button type="button" className="user-editor-close" onClick={cancelEdit} disabled={saving} aria-label="Close user form"><X size={18} aria-hidden="true" /></button>
        </div>
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
            <input id="user-password" aria-label="Password" type="password" autoComplete="new-password" minLength={8} required={!editingUser} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder={editingUser ? 'Leave blank to keep password' : 'Password'} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Office</span>
            <OfficeSelect id="user-office" aria-label="Office" required value={form.office} onChange={event => setForm({ ...form, office: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Division</span>
            <input id="user-division" aria-label="Division" required value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Division" />
          </label>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Account Type</span><select aria-label="Account Type" value={form.role} disabled={!!editingUser} onChange={event => setForm(previous => ({ ...previous, role: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="user">User - Office account</option><option value="admin">Admin - Full access</option></select></label>
          <p className="mt-3 text-sm text-slate-600">{form.role === 'admin' ? 'Admin accounts can access all system pages and manage records, inventory, approvals, returns and accounts.' : 'User accounts can only view their own Issued Items and Returned Items. Admins record requests, issuances and returns for them.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">{(form.role === 'admin' ? ['All system pages', 'Manage records', 'Manage accounts'] : ['Issued Items', 'Returned Items']).map(label => <span key={label} className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">{label}</span>)}</div>
        </div>
        </fieldset>
        <div className="user-editor-footer"><button type="button" disabled={saving} onClick={cancelEdit}>Cancel</button><button type="submit" disabled={saving} className="user-editor-save">Save</button></div>
        </ValidatedForm>
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
