import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useApp } from '../AppContext';

export default function SettingsPage() {
  const { toast, theme, setTheme } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState('');

  const exportBackup = async () => {
    setBusy('export');
    try {
      const data = await api.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `interview-prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    if (!window.confirm('Importing REPLACES all current content with the backup. Continue?')) return;
    setBusy('import');
    try {
      const json = JSON.parse(await file.text());
      const r = await api.importBackup(json);
      await qc.invalidateQueries();
      toast(`Imported ${r.sections} sections, ${r.questions} questions`);
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    const answer = window.prompt('This DELETES all your edits and restores the original questions.\nType RESET to confirm.');
    if (answer !== 'RESET') return;
    setBusy('reset');
    try {
      const r = await api.reset();
      await qc.invalidateQueries();
      toast(`Restored ${r.questions} default questions`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page settings">
      <h1>⚙️ Settings</h1>

      <div className="card">
        <h3>💾 Backup & restore</h3>
        <p className="muted">Your content lives in MongoDB (a Docker volume), so it survives restarts. Export a JSON backup now and then anyway.</p>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={exportBackup} disabled={!!busy}>{busy === 'export' ? 'Exporting…' : '⬇ Export backup (JSON)'}</button>
          <label className="btn">
            {busy === 'import' ? 'Importing…' : '⬆ Import backup'}
            <input type="file" accept="application/json" hidden onChange={importBackup} disabled={!!busy} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>🎨 Appearance</h3>
        <div className="row-gap">
          <button className={`btn ${theme === 'light' ? 'btn-primary' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
          <button className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
        </div>
      </div>

      <div className="card danger-zone">
        <h3>⚠️ Danger zone</h3>
        <p className="muted">Restore the original question bank. All your changes are lost, so export a backup first.</p>
        <button className="btn btn-danger" onClick={reset} disabled={!!busy}>{busy === 'reset' ? 'Resetting…' : 'Reset to default content'}</button>
      </div>

      <div className="card">
        <h3>🧩 How this app is built (explain it in interviews!)</h3>
        <pre className="arch">{`React (Vite) + React Query
   │  axios → /api/*
   ▼
Nginx (serves React build, reverse-proxies /api)
   ▼
Express API  →  routes → controllers → services → repositories
   │                  (zod validation, error middleware, multer uploads)
   ▼
MongoDB (Mongoose models, embedded blocks, aggregation for stats/revise)`}</pre>
        <p className="muted small">API: <code>http://localhost:5050/api/health</code> · MongoDB (Compass): <code>mongodb://localhost:27018</code></p>
      </div>
    </div>
  );
}
