import { useRef, useState } from 'react';
import { Building2, Camera, Mail, Pencil, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import './UsersPage.css';

const emptyProfile = { firstName: '', middleName: '', lastName: '', office: '', division: '', position: '', email: '', password: '', confirmation: '' };

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const isAdmin = user?.role === 'admin';
    const roleLabel = isAdmin ? 'Administrator' : 'User / Office account';
    const pictureInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [pictureError, setPictureError] = useState('');
    const [editing, setEditing] = useState(false);
    const [credentials, setCredentials] = useState(emptyProfile);
    const [saving, setSaving] = useState(false);
    const [accountError, setAccountError] = useState('');
    const editAccount = () => {
        setCredentials({ ...emptyProfile, ...Object.fromEntries(['firstName', 'middleName', 'lastName', 'office', 'division', 'position', 'email'].map(key => [key, user[key] || ''])) });
        setAccountError(''); setEditing(true);
    };
    const saveAccount = async event => {
        event.preventDefault();
        if (credentials.password !== credentials.confirmation) { setAccountError('Passwords do not match.'); return; }
        setSaving(true); setAccountError('');
        try {
            await axios.put(`/users/${user._id}`, {
                firstName: credentials.firstName.trim(), middleName: credentials.middleName.trim(), lastName: credentials.lastName.trim(), username: user.username,
                office: credentials.office.trim(), division: credentials.division.trim(), position: credentials.position.trim(),
                email: credentials.email, password: credentials.password,
            });
            await refreshUser();
            setEditing(false); setCredentials(emptyProfile);
            toast.success('Profile updated', { toasterId: 'account-feedback' });
        } catch (error) { const message = error.response?.data?.message || 'Unable to save account settings.'; setAccountError(message); toast.error(message, { toasterId: 'account-feedback' }); }
        finally { setSaving(false); }
    };
    const uploadPicture = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
            setPictureError('Choose a JPG, PNG, or WebP image, 2 MB or smaller.'); return;
        }
        setUploading(true); setPictureError('');
        try {
            const data = new FormData(); data.append('picture', file);
            await axios.post('/auth/profile-picture', data);
            await refreshUser();
            toast.success('Profile picture updated', { toasterId: 'account-feedback' });
        } catch (error) { const message = error.response?.data?.message || 'Unable to upload profile picture. Please try again.'; setPictureError(message); toast.error(message, { toasterId: 'account-feedback' }); }
        finally { setUploading(false); }
    };
    return <div className="user-management-page my-profile-page">
        <header className="user-management-header">
            <div className="user-management-heading">
                <span className="user-management-eyebrow"><ShieldCheck size={14} aria-hidden="true" />{isAdmin ? 'ADMINISTRATOR ACCOUNT' : 'USER ACCOUNT'}</span>
                <h1>My Profile</h1>
                <p>Your account details, office, and profile picture.</p>
            </div>
        </header>
        <section className="my-profile-grid" aria-label="My account details">
            {user && <article className="user-account-record admin-profile-card">
                <div className="profile-picture-control">
                    <button type="button" className="profile-picture-trigger" aria-label={user.profilePicture ? 'Change profile picture' : 'Upload profile picture'} title="Click to change profile picture" disabled={uploading} onClick={() => pictureInputRef.current?.click()}>
                        <span className="profile-picture-avatar">{user.profilePicture ? <img src={user.profilePicture} alt="" /> : <span aria-hidden="true">{`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.username?.slice(0, 2).toUpperCase()}</span>}</span>
                        <span className="profile-picture-camera"><Camera size={12} aria-hidden="true" /></span>
                    </button>
                    <input ref={pictureInputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture" hidden onChange={uploadPicture} disabled={uploading} />
                </div>
                <div className="user-card-details">
                    <h2>{[user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || user.username}</h2>
                    <p className="user-card-username">@{user.username}</p>
                    <p className="user-card-office"><Building2 size={14} aria-hidden="true" /><span>{user.office || 'Office not assigned'}</span></p>
                    <p className="user-card-email"><Mail size={14} aria-hidden="true" /><span>{user.email || 'Email not assigned'}</span></p>
                    <dl className="my-profile-facts">
                        <div><dt>Username</dt><dd>{user.username}</dd></div>
                        <div><dt>Division</dt><dd>{user.division || 'Not assigned'}</dd></div>
                        {user.position && <div><dt>Position</dt><dd>{user.position}</dd></div>}
                        <div><dt>Account role</dt><dd>{roleLabel}</dd></div>
                        <div><dt>Member since</dt><dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Not available'}</dd></div>
                    </dl>
                    <div className="user-card-labels"><span className={`user-role user-role--${isAdmin ? 'admin' : 'user'}`}>{roleLabel}</span></div>
                    {user.role === 'admin' && !editing && <div className="user-card-account-actions profile-account-settings"><button type="button" className="user-create-button" onClick={editAccount}><Pencil size={16} aria-hidden="true" /><span>Edit Profile</span></button></div>}
                    {user.role === 'admin' && editing && <form className="profile-account-settings" onSubmit={saveAccount}>
                        <h3>Edit Profile</h3>
                        <p>Update your name, office, and account details. Leave password blank to keep your current password.</p>
                        <fieldset disabled={saving}>
                            <div className="grid gap-x-4 sm:grid-cols-2">
                              {[['firstName', 'First name', true], ['middleName', 'Middle name', false], ['lastName', 'Last name / Suffix', true], ['position', 'Position', false], ['office', 'Office', true], ['division', 'Division', true]].map(([key, label, required]) => <label key={key}>{label}<input type="text" aria-label={label} required={required} maxLength={key === 'position' ? 150 : 200} value={credentials[key]} onChange={event => setCredentials(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}
                            </div>
                            <label>Email<input type="email" autoComplete="email" required value={credentials.email} onChange={event => setCredentials({ ...credentials, email: event.target.value })} /></label>
                            <label>New password<input type="password" autoComplete="new-password" minLength={8} value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} /></label>
                            <label>Confirm new password<input type="password" autoComplete="new-password" required={Boolean(credentials.password)} value={credentials.confirmation} onChange={event => setCredentials({ ...credentials, confirmation: event.target.value })} /></label>
                            {accountError && <p role="alert" className="user-editor-error">{accountError}</p>}
                            <div className="profile-account-settings-actions"><button type="submit" className="user-create-button">Save</button><button type="button" onClick={() => { setEditing(false); setCredentials(emptyProfile); }}>Cancel</button></div>
                        </fieldset>
                    </form>}
                    {uploading && <p className="profile-picture-feedback" role="status">Saving profile picture...</p>}
                    {pictureError && <p role="alert" className="profile-picture-error">{pictureError}</p>}
                </div>
                <div className="user-card-footer"><span className={`user-account-status ${user.locked || user.status === 'inactive' ? 'user-account-status--inactive' : ''}`}><span aria-hidden="true" />{user.locked ? 'Account locked' : user.status === 'inactive' ? 'Inactive account' : 'Account active'}</span><span>{user.division || (isAdmin ? 'Administration' : 'Office member')}</span></div>
            </article>}
        </section>
    </div>;
}
