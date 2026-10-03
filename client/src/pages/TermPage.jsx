import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAiEnabled, useTerm, useTermMutations } from '../api/hooks';
import { useApp } from '../AppContext';
import { BlockView } from '../components/blocks/Block';
import BlocksEditor from '../components/blocks/BlocksEditor';
import { inlineMarkdown } from '../utils/html';
import { useTermLinks } from '../utils/termLinks';

const AskAiPanel = lazy(() => import('../components/AskAiPanel'));

// One glossary term: read it, edit it (same block editor as pages) and see the pages that mention it.
export default function TermPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const { data: term, isLoading, error } = useTerm(id);
  const m = useTermMutations();
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const ref = useRef(null);
  const [askAi, setAskAi] = useState(false);
  const aiEnabled = useAiEnabled();
  useTermLinks(ref, { active: !draft, content: term?.blocks, exclude: id });   // link OTHER terms
  const { data: mentions } = useQuery({ queryKey: ['search', term?.term], queryFn: () => api.search(term.term), enabled: !!term });

  const startEdit = useCallback(() => {
    if (!term?.canEdit) return;
    setDraft({ term: term.term, aliases: term.aliases.join(', '), summary: term.summary, blocks: structuredClone(term.blocks) });
    setDirty(false);
  }, [term]);
  useEffect(() => { setDraft(null); setDirty(false); }, [id]);
  useEffect(() => {
    if (term && params.get('edit') === '1' && !draft) { startEdit(); setParams({}, { replace: true }); }
  }, [term, params, draft, startEdit, setParams]);

  const patch = (p) => { setDraft((d) => ({ ...d, ...p })); setDirty(true); };
  const save = useCallback(() => {
    if (!draft) return;
    if (!draft.term.trim()) return toast('The term needs a name', 'error');
    m.update.mutate(
      { id, term: draft.term.trim(), aliases: draft.aliases.split(',').map((a) => a.trim()).filter(Boolean), summary: draft.summary.trim(), blocks: draft.blocks },
      { onSuccess: () => { setDraft(null); setDirty(false); toast('Saved ✓'); }, onError: (e) => toast(e.message, 'error') },
    );
  }, [draft, id, m.update, toast]);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && draft) { e.preventDefault(); save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, save]);

  if (isLoading) return <div className="page"><div className="skeleton" /></div>;
  if (error) return <div className="page"><div className="error">⚠️ {error.message}</div><Link to="/terms">← All terms</Link></div>;
  if (!term) return null;

  const remove = () => {
    if (!window.confirm(`Delete the term “${term.term}”?`)) return;
    m.remove.mutate(id, { onSuccess: () => { toast('Term deleted'); navigate('/terms'); } });
  };
  const cancel = () => { if (dirty && !window.confirm('Discard unsaved changes?')) return; setDraft(null); setDirty(false); };

  return (
    <div className="page question-page term-page">
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/terms">📖 Terms</Link><span className="crumb-sep">›</span><span className="muted">{term.term}</span>{term.owner && <span className="private-pill">🔒 Private</span>}</nav>
      <div className="q-header">
        {draft ? <input className="title-input" value={draft.term} onChange={(e) => patch({ term: e.target.value })} aria-label="Term" maxLength={80} /> : <h1>{term.term}</h1>}
        <div className="q-actions">
          {draft ? (
            <>
              <span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '● Unsaved changes' : 'No changes'}</span>
              <button className="btn" onClick={cancel}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={m.update.isPending}>{m.update.isPending ? 'Saving…' : '💾 Save (Ctrl+S)'}</button>
            </>
          ) : (
            <>
              {aiEnabled && <button className="btn" onClick={() => setAskAi(true)}>🤖 Ask AI</button>}
              {term.canEdit && <button className="btn btn-primary" onClick={startEdit}>✏️ Edit</button>}
              {term.canEdit && <button className="btn btn-danger-ghost" onClick={remove} title="Delete term">🗑</button>}
            </>
          )}
        </div>
      </div>

      {draft ? (
        <div className="form term-meta-form">
          <label>Other names (comma separated)<input value={draft.aliases} onChange={(e) => patch({ aliases: e.target.value })} /></label>
          <label>Summary (shown in previews and links)<textarea rows={2} maxLength={400} value={draft.summary} onChange={(e) => patch({ summary: e.target.value })} /></label>
        </div>
      ) : (
        <>
          {!!term.aliases.length && <p className="muted small">also called: {term.aliases.join(', ')}</p>}
          {term.summary && <p className="term-summary" dangerouslySetInnerHTML={{ __html: inlineMarkdown(term.summary) }} />}
        </>
      )}

      <div className="blocks" ref={ref}>
        {draft ? <BlocksEditor blocks={draft.blocks} setBlocks={(fn) => { setDraft((d) => ({ ...d, blocks: fn(d.blocks) })); setDirty(true); }} />
          : term.blocks.length ? term.blocks.map((b) => <BlockView key={b.id} block={b} />)
            : <div className="empty">No explanation yet.{term.canEdit && <> <button className="btn btn-primary" onClick={startEdit}>✏️ Write it</button></>}</div>}
      </div>

      {askAi && (
        <Suspense fallback={null}>
          <AskAiPanel context={{ termId: id, title: term.term }} onClose={() => setAskAi(false)} />
        </Suspense>
      )}
      {!draft && !!mentions?.length && (
        <div className="card mentions">
          <h3>📄 Pages that mention “{term.term}”</h3>
          <ul>{mentions.slice(0, 12).map((p) => <li key={p._id}><Link to={`/q/${p._id}`}>{p.title}</Link></li>)}</ul>
        </div>
      )}
    </div>
  );
}
