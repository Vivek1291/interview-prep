import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { aiAskStream, api } from '../api/client';
import { keys, useAiStatus, useTree } from '../api/hooks';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import { BlockView } from './blocks/Block';
import { NodeSelect } from './Forms';

// "🤖 Ask AI": ask any configured AI for more detail about the page / term / selected text,
// read the answer as it streams in, and save it as a page wherever you like.

const QUICK = [
  'Explain this in more detail, step by step, with an example',
  'Give 3 more examples with complete code',
  'Explain it like I am a beginner, with an everyday analogy',
  'What are the common interview questions and follow-ups on this?',
  'Draw a diagram of how it works and explain it',
  'What are the edge cases and common mistakes?',
];

export default function AskAiPanel({ context, onClose }) {
  const { data: status } = useAiStatus();
  const { data: tree } = useTree();
  const { isAdmin } = useAuth();
  const { toast } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [question, setQuestion] = useState(context.selection ? 'Explain the selected part in more detail with an example' : QUICK[0]);
  const [providerId, setProviderId] = useState('');
  const [phase, setPhase] = useState('idle');           // idle | streaming | done | error
  const [answer, setAnswer] = useState('');
  const [provider, setProvider] = useState(null);
  const [error, setError] = useState('');
  const [blocks, setBlocks] = useState(null);
  const [title, setTitle] = useState('');
  const page = context.pageId ? tree?.pageById.get(context.pageId) : null;
  const [where, setWhere] = useState(context.pageId ? 'subpage' : 'category');
  const [section, setSection] = useState(page?.section ?? null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);
  const closeRef = useRef(null);
  const outRef = useRef(null);

  useEffect(() => { if (status && !providerId) setProviderId(status.defaultProvider || status.providers[0]?.id || ''); }, [status, providerId]);
  useEffect(() => { if (page && section == null) setSection(page.section); }, [page, section]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); abortRef.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (phase === 'streaming' && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight; }, [answer, phase]);

  const close = () => { abortRef.current?.abort(); onClose(); };

  const ask = async () => {
    if (!question.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('streaming'); setAnswer(''); setBlocks(null); setError('');
    let full = '';
    try {
      await aiAskStream(
        { question: question.trim(), providerId: providerId || undefined, pageId: context.pageId, termId: context.termId, selection: context.selection },
        (ev) => {
          if (ev.type === 'start') setProvider(ev.provider);
          else if (ev.type === 'text') { full += ev.text; setAnswer(full); }
          else if (ev.type === 'error') throw new Error(ev.message);
        },
        controller.signal,
      );
      setPhase('done');
      setTitle(defaultTitle(full, context, question));
      setBlocks(await api.aiPreview(full));                // render exactly as it will be saved
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
      setPhase(full ? 'done' : 'error');
      if (full) setBlocks(await api.aiPreview(full).catch(() => null));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { title: title.trim(), markdown: answer, provider: provider || undefined, ...(where === 'subpage' ? { parent: context.pageId } : { section }) };
      const saved = await api.aiSave(body);
      qc.invalidateQueries({ queryKey: keys.tree });
      toast(saved.owner ? '🔒 Saved as a private page' : '👑 Saved for everyone');
      onClose();
      navigate(`/q/${saved._id}`);
    } catch (e) {
      toast(e.message, 'error');
      setSaving(false);
    }
  };

  const providers = status?.providers || [];
  const canSave = phase === 'done' && answer && title.trim() && (where === 'subpage' ? context.pageId : section);

  return createPortal(
    <>
      <div className="term-panel-backdrop" onClick={close} />
      <aside className="term-panel ai-panel" role="dialog" aria-modal="true" aria-label="Ask AI">
        <div className="term-panel-head">
          <span><b>🤖 Ask AI</b> <span className="muted small">about “{context.title}”</span></span>
          <button className="icon-btn" ref={closeRef} onClick={close} aria-label="Close (Esc)">✕</button>
        </div>
        <div className="term-panel-body">
          {context.selection && <blockquote className="ai-selection">“{context.selection.length > 300 ? `${context.selection.slice(0, 300)}…` : context.selection}”</blockquote>}
          <div className="ai-chips">
            {QUICK.map((q) => <button key={q} type="button" className={`chip ${question === q ? 'on' : ''}`} onClick={() => setQuestion(q)}>{q}</button>)}
          </div>
          <textarea className="ai-question" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} aria-label="Your question"
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask(); }} />
          <div className="ai-row">
            {providers.length > 1 && (
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)} aria-label="AI provider">
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}
              </select>
            )}
            {providers.length === 1 && <span className="muted small">{providers[0].name} · {providers[0].model}</span>}
            {phase === 'streaming'
              ? <button className="btn" onClick={() => { abortRef.current?.abort(); setPhase(answer ? 'done' : 'idle'); if (answer) api.aiPreview(answer).then(setBlocks); setTitle(defaultTitle(answer, context, question)); }}>■ Stop</button>
              : <button className="btn btn-primary" onClick={ask} disabled={!question.trim()}>{phase === 'idle' ? '🤖 Ask' : '↻ Ask again'} <span className="muted small">⌘↵</span></button>}
          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          {phase === 'streaming' && (
            <div className="ai-stream" ref={outRef} aria-live="polite">{answer || <span className="muted">Thinking…</span>}<span className="ai-cursor" /></div>
          )}
          {phase === 'done' && (blocks ? (
            <div className="blocks ai-answer">{blocks.map((b) => <BlockView key={b.id} block={b} />)}</div>
          ) : <div className="ai-stream">{answer}</div>)}

          {phase === 'done' && answer && (
            <div className="card ai-save">
              <h3>💾 Save this answer</h3>
              <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} /></label>
              {context.pageId && (
                <label className="check"><input type="radio" name="where" checked={where === 'subpage'} onChange={() => setWhere('subpage')} /> as a sub-page of “{context.title}”</label>
              )}
              <label className="check"><input type="radio" name="where" checked={where === 'category'} onChange={() => setWhere('category')} /> in a category:</label>
              {where === 'category' && <NodeSelect roots={tree?.roots || []} value={section} onChange={setSection} isAdmin={isAdmin} />}
              <p className="muted small">{isAdmin ? '👑 You are an admin: the page is shared with every user.' : '🔒 Private: only you can see it.'} It is marked as AI-generated; check the facts.</p>
              <button className="btn btn-primary" onClick={save} disabled={!canSave || saving}>{saving ? 'Saving…' : '💾 Save as a page'}</button>
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function defaultTitle(markdown, context, question) {
  const heading = /^#{1,3}\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  if (heading && heading.length > 3) return heading.slice(0, 120);
  return `${context.title}: ${question.replace(/[.?!]+$/, '')}`.slice(0, 120);
}
