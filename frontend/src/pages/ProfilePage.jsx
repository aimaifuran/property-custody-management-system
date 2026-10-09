import { useRef, useState } from 'react';
import { Building2, Camera, Mail, ShieldCheck } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import './UsersPage.css';

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const pictureInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [pictureError, setPictureError] = useState('');
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
            toast.success('Profile picture updated');
        } catch (error) { setPictureError(error.response?.data?.message || 'Unable to upload profile picture. Please try again.'); }
        finally { setUploading(false); }
    };
    return <div className="user-management-page my-profile-page">
        <header className="user-management-header">
            <div className="user-management-heading">
                <span className="user-management-eyebrow"><ShieldCheck size={14} aria-hidden="true" />ADMINISTRATOR ACCOUNT</span>
                <h1>My Profile</h1>
                <p>Your account, office, and administrator access.</p>
            </div>
        </header>
        <section className="my-profile-grid" aria-label="My account details">
            {user && <article className="user-account-record admin-profile-card">
                <div className="profile-picture-control">
                    <button type="button" className="profile-picture-trigger" aria-label={user.profilePicture ? 'Change profile picture' : 'Upload profile picture'} title="Click to change profile picture" disabled={uploading || user.role !== 'admin'} onClick={() => pictureInputRef.current?.click()}>
                        <span className="profile-picture-avatar">{user.profilePicture ? <img src={user.profilePicture} alt="" /> : <span aria-hidden="true">{`${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.username?.slice(0, 2).toUpperCase()}</span>}</span>
                        {user.role === 'admin' && <span className="profile-picture-camera"><Camera size={12} aria-hidden="true" /></span>}
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
                        <div><dt>Account role</dt><dd>Administrator</dd></div>
                        <div><dt>Member since</dt><dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Not available'}</dd></div>
                    </dl>
                    <div className="user-card-labels"><span className="user-role user-role--admin">Administrator</span></div>
                    {uploading && <p className="profile-picture-feedback" role="status">Saving profile picture...</p>}
                    {pictureError && <p role="alert" className="profile-picture-error">{pictureError}</p>}
                </div>
                <div className="user-card-footer"><span className={`user-account-status ${user.locked || user.status === 'inactive' ? 'user-account-status--inactive' : ''}`}><span aria-hidden="true" />{user.locked ? 'Account locked' : user.status === 'inactive' ? 'Inactive account' : 'Account active'}</span><span>{user.division || 'Administration'}</span></div>
            </article>}
        </section>
    </div>;
}
