import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import Spinner from '../components/Spinner';
import { SkeletonList } from '../components/Skeleton';

const permissionOptions = [
  { key: 'canViewRIS', label: 'View RIS' },
  { key: 'canCreateRIS', label: 'Create RIS' },
  { key: 'canReviewRIS', label: 'Review RIS' },
  { key: 'canViewDashboard', label: 'View Dashboard' },
  { key: 'canViewSuppliers', label: 'View Suppliers' },
  { key: 'canManageSuppliers', label: 'Manage Suppliers' },
  { key: 'canViewIAR', label: 'View IAR' },
  { key: 'canManageIAR', label: 'Manage IAR' },
  { key: 'canManageInventory', label: 'Manage Inventory' },
  { key: 'canManageUsers', label: 'Manage Users' },
];

const emptyEditForm = () => ({ role: 'user', status: 'active', permissions: [] });

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '', password: '', office: '', division: '', role: 'user', permissions: ['canViewRIS', 'canCreateRIS'] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/users');
      setUsers(data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/users', form);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const startEditPermissions = (user) => {
    setEditingUserId(user._id);
    setEditForm({
      role: user.role || 'user',
      status: user.status || 'active',
      permissions: user.permissions || [],
    });
  };

  const cancelEditPermissions = () => {
    setEditingUserId(null);
    setEditForm(emptyEditForm());
  };

  const toggleEditPermission = (key, checked) => {
    setEditForm((prev) => ({
      ...prev,
      permissions: checked
        ? [...new Set([...prev.permissions, key])]
        : prev.permissions.filter((value) => value !== key),
    }));
  };

  const saveEditPermissions = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await axios.put(`/users/${editingUserId}`, editForm);
      await load();
      cancelEditPermissions();
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">User Management</h1>
        <p className="text-sm text-slate-500">Create users and manage role-based access.</p>
      </div>
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
            <input id="user-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2" placeholder="Password" />
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
        <button type="submit" disabled={saving} className="mt-4 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
          {saving && <Spinner size={16} />}
          {saving ? 'Creating…' : 'Create User'}
        </button>
      </motion.form>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <SkeletonList count={4} />
        ) : (
          <div className="space-y-3">
            {users.length === 0 && <p className="text-sm text-slate-500">No users found.</p>}
            {users.map((user) => (
              <div key={user._id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{user.firstName} {user.lastName}</div>
                    <div className="text-sm text-slate-500">{user.email} · {user.role} · {user.status || 'active'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (editingUserId === user._id ? cancelEditPermissions() : startEditPermissions(user))}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {editingUserId === user._id ? 'Cancel' : 'Edit Permissions'}
                  </button>
                </div>

                {editingUserId === user._id && (
                  <form onSubmit={saveEditPermissions} className="mt-4 border-t border-slate-200 pt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Role</span>
                        <select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Status</span>
                        <select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
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
                              checked={editForm.permissions.includes(permission.key)}
                              onChange={(e) => toggleEditPermission(permission.key, e.target.checked)}
                              className="h-4 w-4"
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <button type="submit" disabled={savingEdit} className="mt-4 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                      {savingEdit && <Spinner size={16} />}
                      {savingEdit ? 'Saving…' : 'Save Permissions'}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
