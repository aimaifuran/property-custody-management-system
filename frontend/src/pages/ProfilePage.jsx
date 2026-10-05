import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';

const emptyProfileForm = () => ({
    firstName: '',
    middleName: '',
    lastName: '',
    office: '',
    division: ''
});

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();

    const [profileForm, setProfileForm] = useState(emptyProfileForm());
    const [savingProfile, setSavingProfile] = useState(false);

    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [savingPassword, setSavingPassword] = useState(false);

    const [emailStep, setEmailStep] = useState('idle'); // 'idle' | 'code-sent'
    const [newEmail, setNewEmail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [sendingCode, setSendingCode] = useState(false);
    const [confirmingCode, setConfirmingCode] = useState(false);

    useEffect(() => {
        if (user) {
            setProfileForm({
                firstName: user.firstName || '',
                middleName: user.middleName || '',
                lastName: user.lastName || '',
                office: user.office || '',
                division: user.division || ''
            });
        }
    }, [user]);

    const updateProfileField = (key, value) => setProfileForm((prev) => ({ ...prev, [key]: value }));
    const updatePasswordField = (key, value) => setPasswordForm((prev) => ({ ...prev, [key]: value }));

    const saveProfile = async (event) => {
        event.preventDefault();
        setSavingProfile(true);
        try {
            await axios.put('/auth/profile', profileForm);
            await refreshUser();
            toast.success('Profile updated');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to update profile');
        } finally {
            setSavingProfile(false);
        }
    };

    const savePassword = async (event) => {
        event.preventDefault();
        if (passwordForm.newPassword.length < 8) {
            toast.error('New password must be at least 8 characters');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('New password and confirmation do not match');
            return;
        }
        setSavingPassword(true);
        try {
            await axios.post('/auth/change-password', {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            });
            toast.success('Password updated successfully');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to update password');
        } finally {
            setSavingPassword(false);
        }
    };

    const requestEmailChange = async (event) => {
        event.preventDefault();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(newEmail)) {
            toast.error('Please enter a valid email address');
            return;
        }
        setSendingCode(true);
        try {
            const { data } = await axios.post('/auth/request-email-change', { newEmail });
            toast.success(data.message || 'Verification code sent');
            setEmailStep('code-sent');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to send verification code');
        } finally {
            setSendingCode(false);
        }
    };

    const confirmEmailChange = async (event) => {
        event.preventDefault();
        if (!emailCode.trim()) {
            toast.error('Enter the verification code sent to your new email');
            return;
        }
        setConfirmingCode(true);
        try {
            await axios.post('/auth/confirm-email-change', { code: emailCode.trim() });
            await refreshUser();
            toast.success('Email address updated');
            setEmailStep('idle');
            setNewEmail('');
            setEmailCode('');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Unable to confirm verification code');
        } finally {
            setConfirmingCode(false);
        }
    };

    const cancelEmailChange = () => {
        setEmailStep('idle');
        setNewEmail('');
        setEmailCode('');
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-semibold">My Profile</h1>
                <p className="text-sm text-slate-500">Update your personal information, password, and email address.</p>
            </div>

            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Personal Information</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">First Name</span>
                        <input required value={profileForm.firstName} onChange={(e) => updateProfileField('firstName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Middle Name</span>
                        <input value={profileForm.middleName} onChange={(e) => updateProfileField('middleName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Last Name</span>
                        <input required value={profileForm.lastName} onChange={(e) => updateProfileField('lastName', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Username</span>
                        <input disabled value={user?.username || ''} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Office</span>
                        <input required value={profileForm.office} onChange={(e) => updateProfileField('office', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Division</span>
                        <input required value={profileForm.division} onChange={(e) => updateProfileField('division', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                </div>
                <button type="submit" disabled={savingProfile} className="mt-5 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                    {savingProfile && <Spinner size={16} />}
                    {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
            </motion.form>

            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={savePassword} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Change Password</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Current Password</span>
                        <input type="password" required value={passwordForm.currentPassword} onChange={(e) => updatePasswordField('currentPassword', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">New Password</span>
                        <input type="password" required minLength={8} value={passwordForm.newPassword} onChange={(e) => updatePasswordField('newPassword', e.target.value)} placeholder="At least 8 characters" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-slate-700">Confirm New Password</span>
                        <input type="password" required minLength={8} value={passwordForm.confirmPassword} onChange={(e) => updatePasswordField('confirmPassword', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                    </label>
                </div>
                <button type="submit" disabled={savingPassword} className="mt-5 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                    {savingPassword && <Spinner size={16} />}
                    {savingPassword ? 'Updating…' : 'Update Password'}
                </button>
            </motion.form>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Change Email</h2>
                <p className="mt-1 text-sm text-slate-500">Current email: <span className="font-medium text-slate-700">{user?.email}</span></p>

                {emailStep === 'idle' ? (
                    <form onSubmit={requestEmailChange} className="mt-4 flex flex-wrap items-end gap-3">
                        <label className="block flex-1 min-w-[240px]">
                            <span className="mb-1 block text-sm font-semibold text-slate-700">New Email Address</span>
                            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new.email@example.com" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                        </label>
                        <button type="submit" disabled={sendingCode} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                            {sendingCode && <Spinner size={16} />}
                            {sendingCode ? 'Sending…' : 'Send Verification Code'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={confirmEmailChange} className="mt-4 space-y-3">
                        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                            A verification code was sent to <span className="font-semibold">{newEmail}</span>. Enter it below to confirm the change.
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <label className="block">
                                <span className="mb-1 block text-sm font-semibold text-slate-700">Verification Code</span>
                                <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="6-digit code" className="w-full rounded-xl border border-slate-200 px-3 py-2 md:w-48" />
                            </label>
                            <button type="submit" disabled={confirmingCode} className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-white disabled:opacity-60">
                                {confirmingCode && <Spinner size={16} />}
                                {confirmingCode ? 'Confirming…' : 'Confirm'}
                            </button>
                            <button type="button" onClick={cancelEmailChange} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
                        </div>
                    </form>
                )}
            </motion.div>
        </div>
    );
}
