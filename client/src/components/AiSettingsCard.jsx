import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useApp } from '../AppContext';
import Modal from './Modal';

// Settings → 🤖 AI assistant (admins). Providers are pluggable: Claude, OpenAI, Gemini, Ollama and any
// OpenAI-compatible service. API keys are encrypted on the server and never shown again.

function ProviderForm({ initial, types, onSave, onClose }) {
  const [p, setP] = useState(() => initial || { name: '', type: types[0]?.type, model: types[0]?.defaults.model || '', baseUrl: types[0]?.defaults.baseUrl || '', apiKey: '', maxTokens: null, temperature: null });
  const type = types.find((t) => t.type === p.type) || types[0];
  const set = (patch) => setP((x) => ({ ...x, ...patch }));
  const changeType = (t) => {
    const def = types.find((x) => x.type === t);
    set({ type: t, baseUrl: def.defaults.baseUrl, model: def.defaults.model || '', name: p.name || def.label.split(' ')[0] });
  };
  return (
    <Modal title={initial ? `Edit ${initial.name}` : 'Add an AI provider'} onClose={onClose} width={560}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave(p); }}>
        <label>Service
          <select value={p.type} onChange={(e) => changeType(e.target.value)} disabled={!!initial}>
            {types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </label>
        {type?.presets?.length > 0 && (
          <div className="ai-presets"><span className="muted small">Presets:</span>
            {type.presets.map((pr) => <button type="button" key={pr.name} className="chip" onClick={() => set({ name: pr.name, baseUrl: pr.baseUrl })}>{pr.name}</button>)}
          </div>
        )}
        <label>Name (shown to users)<input value={p.name} onChange={(e) => set({ name: e.target.value })} required maxLength={60} placeholder="e.g. Claude" /></label>
        <label>Model<input value={p.model} onChange={(e) => set({ model: e.target.value })} required maxLength={120} placeholder={type?.modelHint} /></label>
        <span className="muted small">{type?.modelHint}</span>
        <label>Base URL<input value={p.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder={type?.defaults.baseUrl || 'https://…'} required={!type?.defaults.baseUrl} /></label>
        <label>API key {type?.needsKey ? '' : <span className="muted small">(optional)</span>}
          <input type="password" autoComplete="off" value={p.apiKey || ''} onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={initial?.hasKey ? `saved (${initial.keyPreview}): leave empty to keep it` : 'paste the key'} required={type?.needsKey && !initial?.hasKey} />
        </label>
        {initial?.hasKey && <label className="check"><input type="checkbox" checked={!!p.clearKey} onChange={(e) => set({ clearKey: e.target.checked })} /> remove the saved key</label>}
        <div className="row-gap">
          <label>Max answer tokens<input type="number" min={50} max={64000} value={p.maxTokens ?? ''} placeholder="default" onChange={(e) => set({ maxTokens: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Temperature<input type="number" min={0} max={2} step={0.1} value={p.temperature ?? ''} placeholder="default" onChange={(e) => set({ temperature: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        </div>
        <p className="muted small">The key is encrypted on the server and never shown again. Ollama and LM Studio run on your computer: from Docker use <code>host.docker.internal</code> instead of <code>localhost</code>.</p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">{initial ? 'Update' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AiSettingsCard() {
  const { toast } = useApp();
  const qc = useQueryClient();
  const [s, setS] = useState(null);
  const [editing, setEditing] = useState(null);      // provider | 'new'
  const [tests, setTests] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.aiSettings().then(setS).catch((e) => toast(e.message, 'error')); }, [toast]);
  if (!s) return <div className="card"><h3>🤖 AI assistant</h3><div className="skeleton" /></div>;

  const persist = async (next) => {
    setSaving(true);
    try {
      const saved = await api.saveAiSettings({
        enabled: next.enabled, allow: next.allow, limitPerHour: next.limitPerHour, defaultProvider: next.defaultProvider,
        providers: next.providers.filter((p) => p.source !== 'env'),
      });
      setS(saved);
      qc.invalidateQueries({ queryKey: ['aiStatus'] });
      toast('AI settings saved');
      return saved;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };
  const update = (patch) => persist({ ...s, ...patch });
  const saveProvider = async (p) => {
    const others = s.providers.filter((x) => x !== editing);
    const saved = await persist({ ...s, providers: [...others.filter((x) => x.id !== p.id), p] });
    if (saved) setEditing(null);
  };
  const test = async (p) => {
    setTests((t) => ({ ...t, [p.id]: { running: true } }));
    const r = await api.testAiProvider(p.id).catch((e) => ({ ok: false, error: e.message }));
    setTests((t) => ({ ...t, [p.id]: r }));
  };
  const typeLabel = (t) => s.adapterTypes.find((x) => x.type === t)?.label || t;

  return (
    <div className="card ai-settings">
      <h3>🤖 AI assistant</h3>
      <p className="muted small">Lets users ask an AI for more detail on any page, term or selected text, and save the answer as a page. Add any provider: Claude, OpenAI, Gemini, a local Ollama model, or any OpenAI-compatible service (Groq, OpenRouter, Mistral, DeepSeek, LM Studio…).</p>
      <div className="ai-settings-grid">
        <label className="check"><input type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} disabled={saving} /> Enabled</label>
        <label>Who can use it
          <select value={s.allow} onChange={(e) => update({ allow: e.target.value })} disabled={saving}>
            <option value="all">Everyone</option>
            <option value="admins">Admins only</option>
          </select>
        </label>
        <label>Questions per user per hour
          <input type="number" min={0} value={s.limitPerHour} onChange={(e) => setS({ ...s, limitPerHour: Number(e.target.value) })} onBlur={() => update({})} />
          <span className="muted small">0 = unlimited · admins are never limited</span>
        </label>
        <label>Default provider
          <select value={s.defaultProvider || ''} onChange={(e) => update({ defaultProvider: e.target.value })} disabled={!s.providers.length || saving}>
            {s.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <table className="users-table ai-providers">
        <thead><tr><th>Name</th><th>Service</th><th>Model</th><th>Key</th><th /></tr></thead>
        <tbody>
          {s.providers.map((p) => (
            <tr key={p.id}>
              <td><b>{p.name}</b>{p.id === s.defaultProvider && <span className="role-pill">default</span>}<div className="muted small">{p.baseUrl}</div></td>
              <td>{typeLabel(p.type)}</td>
              <td><code>{p.model}</code></td>
              <td>{p.source === 'env' ? <span className="muted small">from environment</span> : p.hasKey ? <code>{p.keyPreview}</code> : <span className="muted small">none</span>}</td>
              <td className="ai-actions">
                <button className="btn btn-sm" onClick={() => test(p)} disabled={tests[p.id]?.running}>{tests[p.id]?.running ? 'Testing…' : 'Test'}</button>
                {p.source !== 'env' && <button className="btn btn-sm" onClick={() => setEditing(p)}>Edit</button>}
                {p.source !== 'env' && <button className="btn btn-sm btn-danger-ghost" onClick={() => window.confirm(`Remove ${p.name}?`) && update({ providers: s.providers.filter((x) => x.id !== p.id) })}>Remove</button>}
                {tests[p.id] && !tests[p.id].running && (
                  <div className={`small ${tests[p.id].ok ? 'ok-text' : 'error'}`}>{tests[p.id].ok ? `✓ answered in ${tests[p.id].ms} ms: “${tests[p.id].sample}”` : `✗ ${tests[p.id].error}`}</div>
                )}
              </td>
            </tr>
          ))}
          {!s.providers.length && <tr><td colSpan={5} className="muted">No providers yet.</td></tr>}
        </tbody>
      </table>
      <button className="btn btn-primary" onClick={() => setEditing('new')}>＋ Add provider</button>
      {editing && <ProviderForm initial={editing === 'new' ? null : editing} types={s.adapterTypes} onSave={saveProvider} onClose={() => setEditing(null)} />}
    </div>
  );
}
