import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAiEnabled, useQuestion, useQuestionMutations, useTree } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { NodeSelect, QuestionFormModal } from '../components/Forms';
import { Breadcrumb } from './CategoryPage';
import { useApp } from '../AppContext';
import { BlockView } from '../components/blocks/Block';
import BlocksEditor from '../components/blocks/BlocksEditor';
import TermFormModal from '../components/TermFormModal';
import { useTermLinks } from '../utils/termLinks';

const AskAiPanel = lazy(() => import('../components/AskAiPanel'));
import QuickNotes from '../components/QuickNotes';
import SelectionPopover from '../components/SelectionPopover';
import { escapeHtml } from '../utils/html';
import { storage } from '../utils/storage';

const STATUSES = [
  { value: 'new', label: '○ Not started' },
  { value: 'learning', label: '◐ Learning' },
  { value: 'revise', label: '↻ Needs revision' },
  { value: 'confident', label: '● Confident' },
];

export default function QuestionPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const { data: question, isLoading, error } = useQuestion(id);
  const { data: tree } = useTree();
  const { isAdmin, user } = useAuth();
  const m = useQuestionMutations();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const contentRef = useRef(null);
  const [newTerm, setNewTerm] = useState(null);       // text selected for "Add as term"
  const [addingSub, setAddingSub] = useState(false);  // "＋ Sub-page" form
  const [askAi, setAskAi] = useState(null);           // { selection? } while the AI panel is open
  const aiEnabled = useAiEnabled();
  useTermLinks(contentRef, { active: !editing, content: question?.blocks });   // glossary terms become clickable

  // Remember last visited question for the dashboard "continue" card
  useEffect(() => {
    if (question && user) storage.set(`lastVisited:${user._id}`, { id: question._id, title: question.title });
  }, [question, user]);

  const startEdit = useCallback(() => {
    if (!question?.canEdit) return;
    setDraft(structuredClone({ title: question.title, tags: question.tags, blocks: question.blocks, section: question.section }));
    setDirty(false);
    setEditing(true);
  }, [question]);

  // Reset edit state when switching question; auto-open editor with ?edit=1
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setDirty(false);
  }, [id]);
  useEffect(() => {
    if (question && params.get('edit') === '1' && !editing) {
      startEdit();
      setParams({}, { replace: true });
    }
  }, [question, params, editing, startEdit, setParams]);

  const save = useCallback(() => {
    if (!draft) return;
    if (!draft.title.trim()) return toast('Title cannot be empty', 'error');
    m.update.mutate(
      { id, ...draft, tags: draft.tags.map((t) => t.trim()).filter(Boolean) },
      {
        onSuccess: () => { setEditing(false); setDirty(false); toast('Saved ✓'); },
        onError: (e) => toast(e.message, 'error'),
      }
    );
  }, [draft, id, m.update, toast]);

  // Ctrl/Cmd + S to save, warn before closing tab with unsaved changes
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editing) {
        e.preventDefault();
        save();
      }
    };
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload); };
  }, [editing, dirty, save]);

  const section = tree?.byId.get(String(question?.section));
  const treePage = tree?.pageById.get(id);              // this page in the tree: parents (path) and sub-pages (children)
  const flat = useMemo(() => tree?.pages || [], [tree]);
  const idx = flat.findIndex((q) => q._id === id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  if (isLoading) return <div className="page"><div className="skeleton" /><div className="skeleton" /></div>;
  if (error) return <div className="page"><div className="error">⚠️ {error.message}</div><Link to="/">← Back</Link></div>;
  if (!question) return null;

  const patchDraft = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setBlocks = (fn) => { setDraft((d) => ({ ...d, blocks: fn(d.blocks) })); setDirty(true); };
  const quick = (patch) => m.update.mutate({ id, ...patch }, { onError: (e) => toast(e.message, 'error') });
  const progress = (patch) => m.progress.mutate({ id, ...patch }, { onError: (e) => toast(e.message, 'error') });
  const mine = question.progress || { status: 'new', starred: false, notes: [] };

  const cancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setEditing(false);
    setDraft(null);
    setDirty(false);
  };

  const remove = () => {
    const subs = treePage?.children.length ? ` and its ${treePage.children.length} sub-page(s)` : '';
    if (!window.confirm(`Delete "${question.title}"${subs}? This cannot be undone.`)) return;
    m.remove.mutate(id, { onSuccess: () => { toast('Question deleted'); navigate(next ? `/q/${next._id}` : '/'); } });
  };

  const view = editing ? draft : question;

  return (
    <div className="page question-page">
      <div className="breadcrumb-row">
        {section && <Breadcrumb path={section.path} pages={treePage?.path || []} />}
        {question.owner && <span className="private-pill" title="Only you can see this page">🔒 Private</span>}
      </div>

      <div className="q-header">
        {editing ? (
          <input className="title-input" value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} />
        ) : (
          <h1>{question.title}</h1>
        )}
        <div className="q-actions">
          {!editing && aiEnabled && <button className="btn" onClick={() => setAskAi({})} title="Ask an AI for more detail, examples or a diagram">🤖 Ask AI</button>}
          {!editing && <button className="btn" onClick={() => setAddingSub(true)} title={isAdmin ? 'Add a page inside this page (shared)' : 'Add your own private page inside this page'}>＋ Sub-page</button>}
          {editing ? (
            <>
              <span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '● Unsaved changes' : 'No changes'}</span>
              <button className="btn" onClick={cancel}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={m.update.isPending}>
                {m.update.isPending ? 'Saving…' : '💾 Save (Ctrl+S)'}
              </button>
            </>
          ) : (
            question.canEdit && (
              <>
                <button className="btn btn-primary" onClick={startEdit}>✏️ Edit</button>
                <button className="btn btn-danger-ghost" onClick={remove} title="Delete page">🗑</button>
              </>
            )
          )}
        </div>
      </div>

      <div className="q-meta">
        <div className="stars" title="Interview importance">
          {[1, 2, 3].map((p) => (
            <button key={p} className={p <= question.priority ? 'on' : ''} disabled={!question.canEdit} onClick={() => quick({ priority: p })}>★</button>
          ))}
          <span className="muted small">{question.priority === 3 ? 'Must know' : question.priority === 2 ? 'Important' : 'Good to know'}</span>
        </div>
        <select className={`status-select status-${mine.status}`} value={mine.status} onChange={(e) => progress({ status: e.target.value })} aria-label="My status">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className={`btn btn-sm ${mine.starred ? 'starred' : ''}`} onClick={() => progress({ starred: !mine.starred })}>
          {mine.starred ? '★ Starred' : '☆ Star'}
        </button>
        {editing ? (
          <>
            <input
              className="tags-input"
              placeholder="tags, comma separated"
              value={draft.tags.join(', ')}
              onChange={(e) => patchDraft({ tags: e.target.value.split(',').map((t) => t.trimStart()) })}
              onBlur={() => patchDraft({ tags: draft.tags.map((t) => t.trim()).filter(Boolean) })}
            />
            <span title="Move to category"><NodeSelect roots={tree?.roots || []} value={draft.section} onChange={(v) => v && patchDraft({ section: v })} isAdmin={isAdmin} /></span>
          </>
        ) : (
          <div className="tags">{question.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        )}
      </div>

      <div className="blocks" ref={contentRef}>
        {editing ? (
          <BlocksEditor blocks={draft.blocks} setBlocks={setBlocks} />
        ) : (
          <>
            {view.blocks.map((b) => <BlockView key={b.id} block={b} />)}
            {!view.blocks.length && (
              <div className="empty">
                No content yet.{question.canEdit && <> <button className="btn btn-primary" onClick={startEdit}>✏️ Start writing</button></>}
              </div>
            )}
          </>
        )}
      </div>

      <SelectionPopover
        containerRef={contentRef}
        disabled={editing}
        onAdd={(text) => m.addMyNote.mutate({ id, text: escapeHtml(text) }, { onSuccess: () => toast('📌 Added to my Quick Revise notes') })}
        onAddTerm={(text) => setNewTerm(text)}
        onAskAi={aiEnabled ? (text) => setAskAi({ selection: text }) : undefined}
      />
      {askAi && (
        <Suspense fallback={null}>
          <AskAiPanel context={{ pageId: id, title: question.title, selection: askAi.selection }} onClose={() => setAskAi(null)} />
        </Suspense>
      )}
      {newTerm != null && <TermFormModal selection={newTerm} onClose={() => setNewTerm(null)} />}

      {!editing && (
        <div className="card sub-pages-card">
          <div className="sub-pages-head">
            <h3>📑 Sub-pages{treePage?.children.length ? ` (${treePage.children.length})` : ''}</h3>
            <button className="btn btn-sm" onClick={() => setAddingSub(true)}>＋ Add sub-page</button>
          </div>
          {treePage?.children.length ? (
            <ol className="page-list sub">
              {treePage.children.map((c) => (
                <li key={c._id}><Link to={`/q/${c._id}`}><span className="page-list-title">{c.title}</span>{c.owner && <span title="Private">🔒</span>}{c.children.length > 0 && <span className="muted small">{c.children.length} inside</span>}</Link></li>
              ))}
            </ol>
          ) : <p className="muted small">Break this topic down: e.g. a variant, an edge case or a follow-up question{isAdmin ? ' (shared with everyone).' : ' (private to you).'}</p>}
        </div>
      )}
      {addingSub && (
        <QuestionFormModal
          parentTitle={question.title}
          isAdmin={isAdmin}
          onClose={() => setAddingSub(false)}
          onSubmit={(body) => m.create.mutate({ ...body, parent: id }, {
            onSuccess: (q) => { setAddingSub(false); toast(q.owner ? 'Private sub-page created' : 'Sub-page created'); navigate(`/q/${q._id}?edit=1`); },
            onError: (e) => toast(e.message, 'error'),
          })}
        />
      )}

      {!editing && <QuickNotes question={question} />}

      <div className="pager">
        {prev ? <Link to={`/q/${prev._id}`} className="pager-link">← {prev.title}</Link> : <span />}
        {next ? <Link to={`/q/${next._id}`} className="pager-link right">{next.title} →</Link> : <span />}
      </div>
    </div>
  );
}
