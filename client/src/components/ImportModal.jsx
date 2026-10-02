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

function Destination({ parent, setParent, makeCategory, setMakeCategory, categoryTitle, setCategoryTitle }) {
  const { data: tree } = useTree();
  const { isAdmin } = useAuth();
  return (
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
  );
}

/** Destination state, starting in the category the dialog was opened from. */
function useDestination(startNode, defaultTitle) {
  const { isAdmin } = useAuth();
  // a private start category can't hold shared (admin) content
  const [parent, setParent] = useState(isAdmin && startNode?.owner ? null : startNode?._id ?? null);
  const [makeCategory, setMakeCategory] = useState(true);
  const [categoryTitle, setCategoryTitle] = useState(defaultTitle);
  const ok = makeCategory ? !!categoryTitle.trim() : !!parent;
  const body = () => ({ parent: parent || null, ...(makeCategory ? { newCategory: { title: categoryTitle.trim(), icon: '📥' } } : {}) });
  return { props: { parent, setParent, makeCategory, setMakeCategory, categoryTitle, setCategoryTitle }, ok, body, needsCategory: !makeCategory && !parent };
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
            <><strong>Drop a .docx file here, or click to choose</strong><span className="muted small">From Google Docs: File → Download → Microsoft Word (.docx). Up to 60 MB.<br />Your Google Doc uses <b>tabs</b>? Use the <b>Google Docs link</b> instead: a download loses the tabs.</span></>
          )}
        </label>
      ) : (
        <label className="field">
          <span>Google Docs link</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…/edit" />
          <span className="muted small">The document must be shared as <b>“Anyone with the link”</b> (Share → General access). <b>Tabs and sub-tabs</b> are kept: you choose which ones to import.</span>
        </label>
      )}

      {error && <div className="form-error" role="alert">{error}</div>}
      {busy && (
        <div className="import-progress" aria-live="polite">
          <div className="bar"><div style={{ width: progress != null ? `${progress}%` : '100%' }} className={progress == null ? 'indeterminate' : ''} /></div>
          <span className="muted small">{progress != null && progress < 100 ? `Uploading… ${progress}%` : tab === 'link' ? 'Reading the document from Google Docs…' : 'Reading the document…'}</span>
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={!ready || busy}>{busy ? 'Reading…' : 'Next: preview →'}</button>
      </div>
    </form>
  );
}

function ArrangeStep({ session, startNode, onDone, onBack, onUseTabs }) {
  const dest = useDestination(startNode, session.fileName);
  const [rule, setRule] = useState(session.suggested);
  const [customPrefix, setCustomPrefix] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

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


  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        rule: cleanRule(rule),
        ...dest.body(),
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
      {session.canUseTabs && (
        <p className="import-switch">This document has tabs. <button type="button" className="link-btn" onClick={onUseTabs}>← Import by tabs instead</button></p>
      )}

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

      <Destination {...dest.props} />

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
      {dest.needsCategory && <div className="form-error" role="alert">Choose a category to put the pages in, or tick “Create a new category”.</div>}
      <div className="form-actions sticky">
        <button type="button" className="btn" onClick={onBack} disabled={saving}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || loading || !preview || !pageCount || !dest.ok}>
          {saving ? 'Importing…' : `📥 Import ${fmt(pageCount)} page${pageCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Google Docs with tabs: tick tabs → pages; tabs with sub-tabs → sub-categories (or one page)

function buildTabTree(tabs) {
  const byPath = new Map(tabs.map((t) => [t.path.join(','), { ...t, children: [], depth: t.path.length - 1 }]));
  const roots = [];
  for (const t of byPath.values()) {
    const parent = t.path.length > 1 ? byPath.get(t.path.slice(0, -1).join(',')) : null;
    (parent ? parent.children : roots).push(t);
  }
  const flat = [];
  const walk = (t) => { flat.push(t); t.children.forEach(walk); };
  roots.forEach(walk);
  return { roots, flat };
}
const descendants = (t) => t.children.flatMap((c) => [c, ...descendants(c)]);

function TabRow({ tab, checked, partial, onToggle, title, onTitle, as, onAs, collapsed, onCollapse }) {
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.indeterminate = partial; }, [partial]);
  const hasKids = tab.children.length > 0;
  return (
    <li className={`row tab ${checked ? '' : 'skipped'}`} style={{ '--depth': tab.depth }}>
      {hasKids ? (
        <button type="button" className="caret-btn" onClick={onCollapse} aria-expanded={!collapsed} aria-label={`${collapsed ? 'Show' : 'Hide'} sub-tabs of ${title}`}>{collapsed ? '▸' : '▾'}</button>
      ) : <span className="caret-btn" aria-hidden="true" />}
      <input type="checkbox" ref={box} checked={checked} onChange={onToggle} aria-label={`Import ${title}${hasKids ? ' and its sub-tabs' : ''}`} />
      <span aria-hidden="true">{hasKids && as === 'folder' ? '📁' : '📄'}</span>
      <input className="title" value={title} onChange={(e) => onTitle(e.target.value)} disabled={!checked} aria-label="Title" />
      {hasKids && (
        <select className="as-select" value={as} onChange={(e) => onAs(e.target.value)} disabled={!checked} aria-label={`How to import ${title}`}
          title="Sub-category: each sub-tab becomes its own page. One page: the sub-tabs become sections of this page.">
          <option value="folder">📁 Sub-category ({tab.children.length})</option>
          <option value="page">📄 One page with sections</option>
        </select>
      )}
    </li>
  );
}

function TabsStep({ session, startNode, onDone, onBack, onWhole, switching }) {
  const dest = useDestination(startNode, session.fileName);
  const { roots, flat } = useMemo(() => buildTabTree(session.tabs), [session.tabs]);
  const [checked, setChecked] = useState(() => new Set(session.tabs.map((t) => t.id)));
  const [titles, setTitles] = useState({});
  const [as, setAs] = useState({});
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;               // (React may mount, unmount and mount again in development)
    return () => { alive.current = false; };
  }, []);

  const toggle = (tab) => setChecked((prev) => {
    const next = new Set(prev);
    const on = !prev.has(tab.id);
    for (const t of [tab, ...descendants(tab)]) if (on) next.add(t.id); else next.delete(t.id);
    return next;
  });
  const setAll = (on) => setChecked(on ? new Set(flat.map((t) => t.id)) : new Set());
  const hidden = useMemo(() => {
    const h = new Set();
    for (const t of flat) if (collapsed.has(t.id)) descendants(t).forEach((d) => h.add(d.id));
    return h;
  }, [flat, collapsed]);

  // what will be created (empty tabs are found and skipped while importing)
  const summary = useMemo(() => {
    let categories = 0; let pages = 0;
    const visit = (t, parentPage) => {
      const on = checked.has(t.id);
      const kids = t.children;
      if (on && !parentPage && kids.some((k) => checked.has(k.id) || descendants(k).some((d) => checked.has(d.id))) && (as[t.id] || 'folder') === 'folder') {
        categories += 1; pages += 1; kids.forEach((k) => visit(k, false));
      } else if (on && !parentPage) {
        pages += 1; kids.forEach((k) => visit(k, (as[t.id] || 'folder') === 'page'));
      } else {
        kids.forEach((k) => visit(k, parentPage));
      }
    };
    roots.forEach((r) => visit(r, false));
    return { categories, pages };
  }, [roots, checked, as]);

  const start = async () => {
    setError('');
    try {
      const body = {
        ...dest.body(),
        tabs: flat.filter((t) => checked.has(t.id)).map((t) => ({
          id: t.id,
          ...(titles[t.id] != null && titles[t.id].trim() && titles[t.id] !== t.title ? { title: titles[t.id].trim() } : {}),
          ...(t.children.length && as[t.id] === 'page' ? { as: 'page' } : {}),
        })),
      };
      let st = await api.importCommitTabs(session.id, body);
      setJob(st);
      while (st.state === 'running' && alive.current) {
        await new Promise((r) => setTimeout(r, 700));
        st = await api.importStatus(session.id);
        if (alive.current) setJob(st);
      }
      if (st.state === 'done') onDone(st.result);
      else if (st.state === 'error') { setError(st.error); setJob(null); }
    } catch (e) {
      if (alive.current) { setError(e.message); setJob(null); }
    }
  };

  const busy = !!job;
  const pctDone = job?.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="import-arrange">
      <p className="muted small">
        📑 <b>{session.fileName}</b>: {fmt(flat.length)} tabs in Google Docs.{' '}
        <button type="button" className="link-btn" onClick={onBack} disabled={busy}>choose another document</button>
      </p>

      <div className="import-preview">
        <div className="import-preview-head">
          <strong>Choose the tabs to import</strong>
          <span className="muted small" aria-live="polite">{summary.categories ? `${fmt(summary.categories)} sub-categories · ` : ''}{fmt(summary.pages)} pages</span>
        </div>
        <p className="muted small">
          Every tab becomes a page. A tab with sub-tabs becomes a <b>📁 sub-category</b> (its own text is the first page), or choose <b>📄 one page</b> to keep the sub-tabs as sections.
          Ticking a tab ticks its sub-tabs. Empty tabs are skipped.
        </p>
        <div className="tab-tools">
          <button type="button" className="btn btn-sm" onClick={() => setAll(true)} disabled={busy}>Select all</button>
          <button type="button" className="btn btn-sm" onClick={() => setAll(false)} disabled={busy}>Select none</button>
          <button type="button" className="btn btn-sm" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(flat.filter((t) => t.children.length).map((t) => t.id)))} disabled={busy}>
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
        <ol className="import-rows tabs" aria-label="Tabs">
          {flat.filter((t) => !hidden.has(t.id)).map((t) => {
            const ds = descendants(t);
            const on = checked.has(t.id);
            // "partly selected": some (not all) of this tab and its sub-tabs are ticked
            const partial = ds.length > 0 && ds.some((d) => checked.has(d.id)) && !(on && ds.every((d) => checked.has(d.id)));
            return (
              <TabRow
                key={t.id} tab={t} checked={on} partial={partial} onToggle={() => toggle(t)}
                title={titles[t.id] ?? t.title} onTitle={(v) => setTitles((x) => ({ ...x, [t.id]: v }))}
                as={as[t.id] || 'folder'} onAs={(v) => setAs((x) => ({ ...x, [t.id]: v }))}
                collapsed={collapsed.has(t.id)}
                onCollapse={() => setCollapsed((c) => { const n = new Set(c); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
              />
            );
          })}
        </ol>
      </div>

      <Destination {...dest.props} />
      <p className="import-switch muted small">
        Your notes are not split by tabs?{' '}
        <button type="button" className="link-btn" onClick={onWhole} disabled={busy || switching}>
          {switching ? 'Downloading the whole document… (can take a minute or two)' : 'Ignore the tabs and split the whole document by headings or “Q)” lines'}
        </button>
      </p>

      {busy && (
        <div className="import-progress" aria-live="polite">
          <div className="bar"><div style={{ width: `${Math.max(3, pctDone)}%` }} /></div>
          <span className="muted small">
            {job.step === 'download' ? `Downloading tabs from Google Docs… ${job.done} of ${job.total}` : `Saving pages… ${job.done} of ${job.total}`}
            {job.current ? ` · ${job.current}` : ''}
          </span>
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      {dest.needsCategory && <div className="form-error" role="alert">Choose a category to put the pages in, or tick “Create a new category”.</div>}
      <div className="form-actions sticky">
        <button type="button" className="btn" onClick={onBack} disabled={busy}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={start} disabled={busy || switching || !summary.pages || !dest.ok}>
          {busy ? 'Importing…' : `📥 Import ${fmt(summary.pages)} page${summary.pages === 1 ? '' : 's'}`}
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
    toast(`Imported ${result.pages} page${result.pages === 1 ? '' : 's'}${result.categories ? ` in ${result.categories} categor${result.categories === 1 ? 'y' : 'ies'}` : ''}${result.images ? ` with ${result.images} images` : ''}${result.skipped ? ` (${result.skipped} empty tab${result.skipped === 1 ? '' : 's'} skipped)` : ''}`);
    onClose();
    if (result.category) navigate(`/c/${result.category}`);
  };

  const back = () => { if (sessionRef.current) api.importCancel(sessionRef.current); remember(null); };
  const [switching, setSwitching] = useState(false);
  const toWhole = async () => {
    setSwitching(true);
    try { remember(await api.importWholeDocument(session.id)); } catch (e) { toast(e.message, 'error'); } finally { setSwitching(false); }
  };
  const toTabs = async () => {
    try { remember(await api.importUseTabs(session.id)); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Modal title={node ? `Import a document into “${node.title}”` : 'Import a document'} onClose={busy ? () => {} : onClose} width={session ? 820 : 560}>
      {!session && <SourceStep onRead={read} busy={busy} progress={progress} error={error} />}
      {session?.mode === 'tabs' && <TabsStep key={`t${session.id}`} session={session} startNode={node} onDone={done} onBack={back} onWhole={toWhole} switching={switching} />}
      {session?.mode === 'document' && <ArrangeStep key={`d${session.id}`} session={session} startNode={node} onDone={done} onBack={back} onUseTabs={toTabs} />}
    </Modal>
  );
}
