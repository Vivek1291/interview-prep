import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { useTermMutations } from '../api/hooks';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import { escapeHtml } from '../utils/html';

// Create a glossary term (from the Terms page, or from text selected on a page).
export default function TermFormModal({ selection = '', onClose, openAfter = 'panel' }) {
  const { isAdmin } = useAuth();
  const { toast, openTerm } = useApp();
  const navigate = useNavigate();
  const m = useTermMutations();
  const short = selection.trim().length <= 60 && !selection.includes('\n');
  const [term, setTerm] = useState(short ? selection.trim() : '');
  const [aliases, setAliases] = useState('');
  const [summary, setSummary] = useState(short ? '' : selection.trim().slice(0, 400));
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!term.trim()) return setError('Give the term a name');
    m.create.mutate({
      term: term.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      summary: summary.trim(),
      // start the full explanation with the summary; add code, diagrams… on the term page
      blocks: summary.trim() ? [{ id: crypto.randomUUID(), type: 'text', title: '📖 What it is', content: `<p>${escapeHtml(summary.trim())}</p>` }] : [],
    }, {
      onSuccess: (t) => {
        toast(`📖 “${t.term}” added to your terms`);
        onClose();
        if (openAfter === 'page') navigate(`/terms/${t._id}?edit=1`); else openTerm(t._id);
      },
      onError: (err) => setError(err.message),
    });
  };

  return (
    <Modal title="📖 New term" onClose={onClose} width={520}>
      <form className="form" onSubmit={submit}>
        <label>Term
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={80} placeholder="e.g. libuv" required />
        </label>
        <label>Other names <span className="muted small">(optional, comma separated: they link to this term too)</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. libuv library, uv" />
        </label>
        <label>Summary <span className="muted small">(one or two sentences for quick revision)</span>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={400} placeholder="What is it, in one breath?" />
        </label>
        <p className="muted small">{isAdmin ? '👑 Shared with everyone.' : '🔒 Private: only you can see it.'} You can add code, diagrams and images on the term's page.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={m.create.isPending}>{m.create.isPending ? 'Saving…' : 'Add term'}</button>
        </div>
      </form>
    </Modal>
  );
}
