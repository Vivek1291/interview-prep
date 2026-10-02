import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, useTree } from '../api/hooks';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import Modal from './Modal';
import { NodeSelect } from './Forms';

// Import a prepared document (Word .docx or a Google Docs link): its headings or "Q)" lines
// become pages (and sub-categories) in the left navigation.

const SHOW_ROWS = 400;
const ruleKey = (r) => (r ? `${r.type}:${r.level || r.prefix || ''}` : '');
// only the rule itself goes to the server (the options also carry a label and a count)
const cleanRule = (r) => ({ type: r.type, ...(r.type === 'heading' ? { level: r.level } : {}), ...(r.type === 'prefix' ? { prefix: r.prefix.trim() } : {}) });
const fmt = (n) => n.toLocaleString();

function StatLine({ stats }) {
  const parts = [
    stats.paragraphs && `${fmt(stats.paragraphs)} paragraphs`,
    stats.codeLines && `${fmt(stats.codeLines)} code lines`,
    stats.tables && `${fmt(stats.tables)} tables`,
    stats.images && `${fmt(stats.images)} images`,
  ].filter(Boolean);
  return <span>{parts.join(' · ') || 'empty'}</span>;
}

function SourceStep({ onRead, busy, progress, error }) {
  const [tab, setTab] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [over, setOver] = useState(false);
  const pick = (f) => f && setFile(f);
  const ready = tab === 'file' ? !!file : /docs\.google\.com\/document\//.test(url);

  return (
    <form className="form import-source" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) onRead(tab === 'file' ? { file } : { url: url.trim() }); }}>
      <p className="muted small">
        Bring in notes you already wrote. <b>Headings</b> or lines like <b>“Q) …”</b> become pages in the left navigation;
        code, tables, lists, links and images come along.
      </p>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}>📄 Word file (.docx)</button>
        <button type="button" role="tab" aria-selected={tab === 'link'} className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>🔗 Google Docs link</button>
      </div>

      {tab === 'file' ? (
        <label
          className={`dropzone ${over ? 'over' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        >
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <><strong>📄 {file.name}</strong><span className="muted small">{(file.size / 1048576).toFixed(1)} MB · click to choose another file</span></>
          ) : (
            <><strong>Drop a .docx file here, or click to choose</strong><span className="muted small">From Google Docs: File → Download → Microsoft Word (.docx). Up to 60 MB.</span></>
          )}
        </label>
      ) : (
        <label className="field">
          <span>Google Docs link</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…/edit" />
          <span className="muted small">The document must be shared as <b>“Anyone with the link”</b> (Share → General access). Large documents can take a minute or two.</span>
        </label>
      )}

      {error && <div className="form-error" role="alert">{error}</div>}
      {busy && (
        <div className="import-progress" aria-live="polite">
          <div className="bar"><div style={{ width: progress != null ? `${progress}%` : '100%' }} className={progress == null ? 'indeterminate' : ''} /></div>
          <span className="muted small">{progress != null && progress < 100 ? `Uploading… ${progress}%` : tab === 'link' ? 'Downloading from Google Docs and reading it…' : 'Reading the document…'}</span>
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!ready || busy}>{busy ? 'Reading…' : 'Next: preview →'}</button>
      </div>
    </form>
  );
}

function ArrangeStep({ session, startNode, onDone, onBack }) {
  const { data: tree } = useTree();
  const { isAdmin } = useAuth();
  const [rule, setRule] = useState(session.suggested);
  const [customPrefix, setCustomPrefix] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState({});
  const [parent, setParent] = useState(startNode?._id ?? null);
  const [makeCategory, setMakeCategory] = useState(true);
  const [categoryTitle, setCategoryTitle] = useState(session.fileName);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  // a private start category can't hold shared (admin) content
  useEffect(() => { if (isAdmin && startNode?.owner) setParent(null); }, [isAdmin, startNode]);

  useEffect(() => {
    if (rule.type === 'prefix' && !rule.prefix.trim()) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    const t = setTimeout(() => {
      api.importPreview(session.id, cleanRule(rule))
        .then((p) => { if (alive) { setPreview(p); setEdits({}); setShowAll(false); } })
        .catch((e) => { if (alive) { setPreview(null); setError(e.message); } })
        .finally(() => alive && setLoading(false));
    }, rule.type === 'prefix' && rule.custom ? 350 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [session.id, ruleKey(rule)]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (key, patch) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
  const items = preview?.items || [];
  const { pageCount, mergedCount } = useMemo(() => {
    let pages = 0; let merged = 0; let prevPage = false;
    for (const it of items) {
      if (it.type !== 'page') { prevPage = false; continue; }
      const e = edits[it.key] || {};
      if (e.skip) continue;
      if (e.merge && prevPage) merged += 1; else pages += 1;
      prevPage = true;
    }
    return { pageCount: pages, mergedCount: merged };
  }, [items, edits]);

  const destinationOk = makeCategory ? categoryTitle.trim() : parent;
  const pagesNeedCategory = !makeCategory && !parent;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        rule: cleanRule(rule),
        parent: parent || null,
        ...(makeCategory ? { newCategory: { title: categoryTitle.trim(), icon: '📥' } } : {}),
        items: Object.entries(edits).map(([key, e]) => ({ key, ...(e.title != null ? { title: e.title } : {}), ...(e.merge ? { merge: true } : {}), ...(e.skip ? { skip: true } : {}) })),
      };
      onDone(await api.importCommit(session.id, body));
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const rows = showAll ? items : items.slice(0, SHOW_ROWS);
  let seenPage = false;

  return (
    <div className="import-arrange">
      <p className="muted small">📄 <b>{session.fileName}</b>: <StatLine stats={session.stats} /> <button type="button" className="link-btn" onClick={onBack}>choose another document</button></p>

      <fieldset className="import-rules">
        <legend>How should it be split into pages?</legend>
        {session.rules.map((r) => (
          <label key={ruleKey(r)} className={`rule ${ruleKey(r) === ruleKey(rule) && !rule.custom ? 'active' : ''}`}>
            <input type="radio" name="rule" checked={ruleKey(r) === ruleKey(rule) && !rule.custom} onChange={() => setRule(r)} />
            <span>{r.label}</span>
            <span className="muted small">{r.type === 'single' ? '1 page' : `${fmt(r.count)} ${r.type === 'prefix' ? 'pages' : `× Heading ${r.level}`}`}</span>
            {ruleKey(r) === ruleKey(session.suggested) && <span className="pill">suggested</span>}
          </label>
        ))}
        <label className={`rule ${rule.custom ? 'active' : ''}`}>
          <input type="radio" name="rule" checked={!!rule.custom} onChange={() => setRule({ type: 'prefix', prefix: customPrefix, custom: true })} />
          <span>Each line starting with</span>
          <input
            className="prefix-input" value={customPrefix} placeholder="e.g. Topic:" aria-label="Custom start of line"
            onFocus={() => !rule.custom && setRule({ type: 'prefix', prefix: customPrefix, custom: true })}
            onChange={(e) => { setCustomPrefix(e.target.value); setRule({ type: 'prefix', prefix: e.target.value, custom: true }); }}
          />
        </label>
      </fieldset>

      <fieldset className="import-dest">
        <legend>Where should it go?</legend>
        <label className="field-inline">
          <span>Inside</span>
          <NodeSelect roots={tree?.roots || []} value={parent} onChange={setParent} allowRoot isAdmin={isAdmin} />
        </label>
        <label className="check">
          <input type="checkbox" checked={makeCategory} onChange={(e) => setMakeCategory(e.target.checked)} />
          <span>Create a new category for it:</span>
          <input value={categoryTitle} onChange={(e) => setCategoryTitle(e.target.value)} disabled={!makeCategory} maxLength={120} aria-label="New category name" />
        </label>
        <p className="muted small">{isAdmin ? '👑 As an admin, the import is shared: every user will see it.' : '🔒 The import is private: only you can see and edit it.'}</p>
      </fieldset>

      <div className="import-preview">
        <div className="import-preview-head">
          <strong>Preview</strong>
          <span className="muted small" aria-live="polite">
            {loading ? 'updating…' : preview && `${preview.categories ? `${fmt(preview.categories)} sub-categories · ` : ''}${fmt(pageCount)} pages${mergedCount ? ` (${fmt(mergedCount)} merged)` : ''}`}
          </span>
        </div>
        <p className="muted small">Rename anything below. <b>⤴ Merge</b> joins a page into the one above it (nothing is lost); untick a page to leave it out.</p>
        <ol className={`import-rows ${loading ? 'loading' : ''}`}>
          {rows.map((it) => {
            const e = edits[it.key] || {};
            const canMerge = it.type === 'page' && seenPage;
            if (it.type === 'page') seenPage = true; else seenPage = false;
            return (
              <li key={it.key} className={`row ${it.type} ${e.skip ? 'skipped' : ''} ${e.merge && canMerge ? 'merged' : ''}`} style={{ '--depth': it.depth }}>
                {it.type === 'page' ? (
                  <input type="checkbox" checked={!e.skip} onChange={(ev) => edit(it.key, { skip: !ev.target.checked })} aria-label={`Include ${it.title}`} />
                ) : <span aria-hidden="true">📁</span>}
                <input className="title" value={e.title ?? it.title} onChange={(ev) => edit(it.key, { title: ev.target.value })} aria-label={`${it.type === 'page' ? 'Page' : 'Category'} title`} disabled={e.skip} />
                {it.stats && (
                  <span className="meta muted small" title="paragraphs · code lines · images · tables">
                    {[it.stats.paragraphs && `${it.stats.paragraphs}¶`, it.stats.codeLines && `${it.stats.codeLines} code`, it.stats.images && `${it.stats.images}🖼`, it.stats.tables && `${it.stats.tables}▦`].filter(Boolean).join(' · ')}
                  </span>
                )}
                {canMerge && (
                  <button type="button" className={`btn btn-sm merge ${e.merge ? 'on' : ''}`} aria-pressed={!!e.merge} onClick={() => edit(it.key, { merge: !e.merge })} disabled={e.skip} title="Join this page into the page above">
                    ⤴ Merge
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {items.length > rows.length && (
          <button type="button" className="btn btn-sm" onClick={() => setShowAll(true)}>Show all {fmt(items.length)} rows</button>
        )}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {pagesNeedCategory && <div className="form-error" role="alert">Choose a category to put the pages in, or tick “Create a new category”.</div>}
      <div className="form-actions sticky">
        <button type="button" className="btn" onClick={onBack} disabled={saving}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || loading || !preview || !pageCount || !destinationOk}>
          {saving ? 'Importing…' : `📥 Import ${fmt(pageCount)} page${pageCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

export default function ImportModal({ node, onClose }) {
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const sessionRef = useRef(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useApp();

  // free the server memory if the dialog is closed before importing
  useEffect(() => () => { if (sessionRef.current) api.importCancel(sessionRef.current); }, []);
  const remember = (s) => { sessionRef.current = s?.id || null; setSession(s); };

  const read = async (source) => {
    setBusy(true);
    setError('');
    setProgress(source.file ? 0 : null);
    try {
      const s = await api.importStart(source, (e) => setProgress(e.total ? Math.min(100, Math.round((e.loaded / e.total) * 100)) : null));
      remember(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const done = (result) => {
    sessionRef.current = null;
    qc.invalidateQueries({ queryKey: keys.tree });
    toast(`Imported ${result.pages} page${result.pages === 1 ? '' : 's'}${result.categories ? ` in ${result.categories} categor${result.categories === 1 ? 'y' : 'ies'}` : ''}${result.images ? ` with ${result.images} images` : ''}`);
    onClose();
    if (result.category) navigate(`/c/${result.category}`);
  };

  const back = () => { if (sessionRef.current) api.importCancel(sessionRef.current); remember(null); };

  return (
    <Modal title={node ? `Import a document into “${node.title}”` : 'Import a document'} onClose={busy ? () => {} : onClose} width={session ? 820 : 560}>
      {session
        ? <ArrangeStep session={session} startNode={node} onDone={done} onBack={back} />
        : <SourceStep onRead={read} busy={busy} progress={progress} error={error} />}
    </Modal>
  );
}
