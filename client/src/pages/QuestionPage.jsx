import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useQuestion, useQuestionMutations, useTree } from '../api/hooks';
import { useApp } from '../AppContext';
import { AddBlockMenu, BlockEditor, BlockView } from '../components/blocks/Block';
import QuickNotes from '../components/QuickNotes';
import SelectionPopover from '../components/SelectionPopover';
import { escapeHtml } from '../utils/html';
import { storage } from '../utils/storage';
import { uid } from '../utils/id';

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
  const { data: tree = [] } = useTree();
  const m = useQuestionMutations();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const contentRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Remember last visited question for the dashboard "continue" card
  useEffect(() => {
    if (question) storage.set('lastVisited', { id: question._id, title: question.title });
  }, [question]);

  const startEdit = useCallback(() => {
    if (!question) return;
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

  const section = tree.find((s) => s._id === question?.section);
  const flat = useMemo(() => tree.flatMap((s) => s.questions), [tree]);
  const idx = flat.findIndex((q) => q._id === id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  if (isLoading) return <div className="page"><div className="skeleton" /><div className="skeleton" /></div>;
  if (error) return <div className="page"><div className="error">⚠️ {error.message}</div><Link to="/">← Back</Link></div>;
  if (!question) return null;

  const patchDraft = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setBlocks = (fn) => { setDraft((d) => ({ ...d, blocks: fn(d.blocks) })); setDirty(true); };
  const quick = (patch) => m.update.mutate({ id, ...patch }, { onError: (e) => toast(e.message, 'error') });

  const cancel = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setEditing(false);
    setDraft(null);
    setDirty(false);
  };

  const remove = () => {
    if (!window.confirm(`Delete "${question.title}"? This cannot be undone.`)) return;
    m.remove.mutate(id, { onSuccess: () => { toast('Question deleted'); navigate(next ? `/q/${next._id}` : '/'); } });
  };

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setBlocks((blocks) => arrayMove(blocks, blocks.findIndex((b) => b.id === active.id), blocks.findIndex((b) => b.id === over.id)));
  };

  const view = editing ? draft : question;

  return (
    <div className="page question-page">
      <div className="breadcrumb">
        {section && (
          <span style={{ color: section.color }}>
            {section.icon} {section.title}
          </span>
        )}
        {idx >= 0 && <span className="muted"> · {idx + 1} / {flat.length}</span>}
      </div>

      <div className="q-header">
        {editing ? (
          <input className="title-input" value={draft.title} onChange={(e) => patchDraft({ title: e.target.value })} />
        ) : (
          <h1>{question.title}</h1>
        )}
        <div className="q-actions">
          {editing ? (
            <>
              <span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '● Unsaved changes' : 'No changes'}</span>
              <button className="btn" onClick={cancel}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={m.update.isPending}>
                {m.update.isPending ? 'Saving…' : '💾 Save (Ctrl+S)'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={startEdit}>✏️ Edit</button>
              <button className="btn btn-danger-ghost" onClick={remove} title="Delete question">🗑</button>
            </>
          )}
        </div>
      </div>

      <div className="q-meta">
        <div className="stars" title="Interview importance">
          {[1, 2, 3].map((p) => (
            <button key={p} className={p <= question.priority ? 'on' : ''} onClick={() => quick({ priority: p })}>★</button>
          ))}
          <span className="muted small">{question.priority === 3 ? 'Must know' : question.priority === 2 ? 'Important' : 'Good to know'}</span>
        </div>
        <select className={`status-select status-${question.status}`} value={question.status} onChange={(e) => quick({ status: e.target.value })}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className={`btn btn-sm ${question.starred ? 'starred' : ''}`} onClick={() => quick({ starred: !question.starred })}>
          {question.starred ? '★ Starred' : '☆ Star'}
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
            <select value={draft.section} onChange={(e) => patchDraft({ section: e.target.value })} title="Move to section">
              {tree.map((s) => <option key={s._id} value={s._id}>{s.icon} {s.title}</option>)}
            </select>
          </>
        ) : (
          <div className="tags">{question.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        )}
      </div>

      <div className="blocks" ref={contentRef}>
        {editing ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={draft.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <AddBlockMenu compact onAdd={(b) => setBlocks((bl) => [b, ...bl])} />
              {draft.blocks.map((b, i) => (
                <div key={b.id}>
                  <BlockEditor
                    block={b}
                    index={i}
                    total={draft.blocks.length}
                    onChange={(nb) => setBlocks((bl) => bl.map((x) => (x.id === b.id ? nb : x)))}
                    onMove={(dir) => setBlocks((bl) => arrayMove(bl, i, i + dir))}
                    onDuplicate={() => setBlocks((bl) => [...bl.slice(0, i + 1), { ...structuredClone(b), id: uid() }, ...bl.slice(i + 1)])}
                    onDelete={() => window.confirm('Delete this block?') && setBlocks((bl) => bl.filter((x) => x.id !== b.id))}
                  />
                  <AddBlockMenu compact onAdd={(nb) => setBlocks((bl) => [...bl.slice(0, i + 1), nb, ...bl.slice(i + 1)])} />
                </div>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <>
            {view.blocks.map((b) => <BlockView key={b.id} block={b} />)}
            {!view.blocks.length && (
              <div className="empty">
                No content yet. <button className="btn btn-primary" onClick={startEdit}>✏️ Start writing</button>
              </div>
            )}
          </>
        )}
      </div>

      <SelectionPopover
        containerRef={contentRef}
        disabled={editing}
        onAdd={(text) => m.addNote.mutate({ id, text: escapeHtml(text) }, { onSuccess: () => toast('📌 Added to Quick Revise') })}
      />

      {!editing && <QuickNotes question={question} />}

      <div className="pager">
        {prev ? <Link to={`/q/${prev._id}`} className="pager-link">← {prev.title}</Link> : <span />}
        {next ? <Link to={`/q/${next._id}`} className="pager-link right">{next.title} →</Link> : <span />}
      </div>
    </div>
  );
}
