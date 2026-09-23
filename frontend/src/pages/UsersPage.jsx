import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const permissionOptions = [
  { key: 'canViewDashboard', label: 'View Dashboard' },
  { key: 'canViewRIS', label: 'View My RIS' },
];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });

  const load = async () => {
    const { data } = await axios.get('/users');
    setUsers(data.data || []);
  };

  useEffect(() => { load(); }, []);

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
    try {
      await axios.patch(`/users/${user._id}/lock`, { locked: !user.locked });
      toast.success(user.locked ? 'User unlocked' : 'User locked');
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to change lock status');
    }
  };

  const pageSize = 6;
  const pagedUsers = users.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(users.length / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">User Management</h1>
        <p className="text-sm text-slate-500">Create users and manage role-based access.</p>
      </div>
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
                  <button type="button" onClick={() => editUser(user)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Edit Access</button>
                  <button type="button" onClick={() => toggleLock(user)} className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${user.locked ? 'bg-emerald-600' : 'bg-rose-600'}`}>{user.locked ? 'Unlock' : 'Lock'}</button>
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
