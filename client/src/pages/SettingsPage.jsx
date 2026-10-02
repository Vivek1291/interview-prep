import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useUsers } from '../api/hooks';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import Avatar from '../components/Avatar';

const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function ProfileCard() {
  const { user, setUser } = useAuth();
  const { toast } = useApp();
  const [name, setName] = useState(user.name);
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState('');

  const saveName = async (e) => {
    e.preventDefault();
    setBusy('name');
    setNameError('');
    try {
      setUser(await api.updateProfile({ name }));
      toast('Profile saved');
    } catch (err) {
      setNameError(err.details?.[0]?.message || err.message);
    } finally {
      setBusy('');
    }
  };

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return toast('Please choose a PNG, JPG, WEBP or GIF image', 'error');
    if (file.size > 2 * 1024 * 1024) return toast('Images must be 2 MB or smaller', 'error');
    setBusy('avatar');
    try {
      setUser(await api.uploadAvatar(file));
      toast('Avatar updated');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeAvatar = async () => {
    setBusy('avatar');
    try {
      setUser(await api.removeAvatar());
      toast('Avatar removed');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card">
      <h3>👤 Profile</h3>
      <div className="profile-row">
        <Avatar user={user} size={72} />
        <div className="row-gap">
          <label className="btn">
            {busy === 'avatar' ? 'Uploading…' : '📷 Change avatar'}
            <input type="file" accept={AVATAR_TYPES.join(',')} hidden onChange={onAvatar} disabled={!!busy} aria-label="Upload avatar" />
          </label>
          {user.avatarUrl && <button className="btn btn-danger-ghost" onClick={removeAvatar} disabled={!!busy}>Remove</button>}
          <span className="muted small">PNG, JPG, WEBP or GIF, up to 2 MB</span>
        </div>
      </div>
      <form className="form inline-form" onSubmit={saveName} aria-label="Profile">
        <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} aria-describedby={nameError ? 'name-error' : undefined} />
          {nameError && <span id="name-error" className="field-error">{nameError}</span>}
        </label>
        <label>Email<input value={user.email} disabled /></label>
        <p className="muted small">Role: <b>{user.role === 'admin' ? '🛡️ Admin' : 'Learner'}</b></p>
        <div><button className="btn btn-primary" disabled={!!busy || name.trim() === user.name}>{busy === 'name' ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  );
}

function PasswordCard() {
  const { toast } = useApp();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api.changePassword(form);
      setForm({ currentPassword: '', newPassword: '' });
      toast('Password changed. Other devices have been logged out.');
    } catch (err) {
      setErrors(err.details?.length ? Object.fromEntries(err.details.map((d) => [d.path, d.message])) : { form: err.message });
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="card">
      <h3>🔑 Password</h3>
      <form className="form inline-form" onSubmit={submit} aria-label="Change password">
        <label>Current password<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} aria-invalid={!!errors.currentPassword} />
          {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}</label>
        <label>New password<input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} aria-invalid={!!errors.newPassword} />
          {errors.newPassword && <span className="field-error">{errors.newPassword}</span>}</label>
        {errors.form && <p className="error" role="alert">{errors.form}</p>}
        <div><button className="btn btn-primary" disabled={busy || !form.currentPassword || !form.newPassword}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </div>
  );
}

function UsersCard() {
  const { user } = useAuth();
  const { toast } = useApp();
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useUsers(true);
  const setRole = async (u, role) => {
    try {
      await api.setRole(u._id, role);
      qc.invalidateQueries({ queryKey: keys.users });
      toast(`${u.name} is now ${role === 'admin' ? 'an admin' : 'a learner'}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <div className="card">
      <h3>👥 Users</h3>
      <p className="muted small">Admins edit the shared content. Learners read it and keep their own progress and private pages.</p>
      {isLoading ? <div className="skeleton" /> : (
        <table className="users-table">
          <thead><tr><th /><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td><Avatar user={u} size={28} /></td>
                <td>{u.name}{u._id === user._id && <span className="muted small"> (you)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u, e.target.value)} aria-label={`Role of ${u.name}`}>
                    <option value="user">Learner</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="muted small">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SharedContentCard() {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');

  const exportBackup = async () => {
    setBusy('export');
    try {
      const data = await api.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `learning-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Backup downloaded');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Importing REPLACES all shared content with the backup. Users\' private pages and progress are kept. Continue?')) return;
    setBusy('import');
    try {
      const r = await api.importBackup(JSON.parse(await file.text()));
      await qc.invalidateQueries();
      toast(`Imported ${r.sections} categories, ${r.questions} pages`);
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    const answer = window.prompt('This restores the original SHARED content: edits to shared pages are lost.\nUsers\' private pages and progress are kept.\nType RESET to confirm.');
    if (answer !== 'RESET') return;
    setBusy('reset');
    try {
      const r = await api.reset();
      await qc.invalidateQueries();
      toast(`Restored ${r.questions} default pages`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="card">
        <h3>💾 Shared content: backup & restore</h3>
        <p className="muted">Exports and imports the shared (admin) content. Each user's private pages and progress stay in the database.</p>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={exportBackup} disabled={!!busy}>{busy === 'export' ? 'Exporting…' : '⬇ Export backup (JSON)'}</button>
          <label className="btn">
            {busy === 'import' ? 'Importing…' : '⬆ Import backup'}
            <input type="file" accept="application/json" hidden onChange={importBackup} disabled={!!busy} />
          </label>
        </div>
      </div>
      <div className="card danger-zone">
        <h3>⚠️ Danger zone</h3>
        <p className="muted">Restore the original shared content. Edits to shared pages are lost, so export a backup first.</p>
        <button className="btn btn-danger" onClick={reset} disabled={!!busy}>{busy === 'reset' ? 'Resetting…' : 'Reset shared content to default'}</button>
      </div>
    </>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useApp();
  const { isAdmin } = useAuth();
  return (
    <div className="page settings">
      <h1>⚙️ Settings</h1>
      <ProfileCard />
      <PasswordCard />
      <div className="card">
        <h3>🎨 Appearance</h3>
        <div className="row-gap">
          <button className={`btn ${theme === 'light' ? 'btn-primary' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
          <button className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
        </div>
      </div>
      {isAdmin && <UsersCard />}
      {isAdmin && <SharedContentCard />}
    </div>
  );
}
