import { Suspense, lazy, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuestionMutations, useSectionMutations, useTree } from '../api/hooks';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import { QuestionFormModal, SectionFormModal } from '../components/Forms';
import { pct } from '../utils/tree';

const ImportModal = lazy(() => import('../components/ImportModal'));

const STATUS_LABEL = { new: '○ Not started', learning: '◐ Learning', revise: '↻ Revise', confident: '● Confident' };

export function Breadcrumb({ path, current }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/">🏠</Link>
      {path.map((n, i) => (
        <span key={n._id}>
          <span className="crumb-sep">›</span>
          {i === path.length - 1 && !current ? <span style={{ color: n.color }}>{n.icon} {n.title}</span> : <Link to={`/c/${n._id}`}>{n.icon} {n.title}</Link>}
        </span>
      ))}
      {current && <><span className="crumb-sep">›</span><span className="muted">{current}</span></>}
    </nav>
  );
}

export default function CategoryPage() {
  const { id } = useParams();
  const { data: tree, isLoading } = useTree();
  const { isAdmin } = useAuth();
  const { toast } = useApp();
  const navigate = useNavigate();
  const sections = useSectionMutations();
  const questions = useQuestionMutations();
  const [modal, setModal] = useState(null);

  if (isLoading) return <div className="page"><div className="skeleton" /></div>;
  const node = tree?.byId.get(id);
  if (!node) return <div className="page"><div className="empty">This category doesn't exist or you can't see it. <Link to="/">Go home</Link></div></div>;
  const done = (fn) => ({ onSuccess: fn, onError: (e) => toast(e.message, 'error') });

  return (
    <div className="page category-page">
      <Breadcrumb path={node.path} />
      <div className="q-header">
        <h1><span style={{ marginRight: 10 }}>{node.icon}</span>{node.title}{node.owner && <span className="private-pill" title="Only you can see this">🔒 Private</span>}</h1>
        <div className="q-actions">
          <button className="btn" onClick={() => setModal({ type: 'section' })}>📁 Sub-category</button>
          <button className="btn btn-primary" onClick={() => setModal({ type: 'page' })}>📄 New page</button>
          <button className="btn" onClick={() => setModal({ type: 'import' })} title="Import a Word file or Google Doc: its headings become pages">📥 Import</button>
          {node.canEdit && <button className="btn" onClick={() => setModal({ type: 'edit' })}>✎ Edit</button>}
        </div>
      </div>
      {node.description && <p className="muted category-desc">{node.description}</p>}

      <div className="stat-row">
        <div className="stat"><span className="stat-n">{node.stats.total}</span><span>Pages</span></div>
        <div className="stat s-confident"><span className="stat-n">{node.stats.confident}</span><span>● Confident</span></div>
        <div className="stat s-revise"><span className="stat-n">{node.stats.revise}</span><span>↻ Revise</span></div>
        <div className="stat s-learning"><span className="stat-n">{node.stats.learning}</span><span>◐ Learning</span></div>
        <div className="stat"><span className="stat-n">{pct(node.stats)}%</span><span>Done</span></div>
      </div>

      {node.children.length > 0 && (
        <section>
          <h2 className="list-title">Topics</h2>
          <div className="topic-grid">
            {node.children.map((c) => (
              <Link key={c._id} to={`/c/${c._id}`} className="topic-card" style={{ '--sec': c.color }}>
                <div className="topic-head"><span className="topic-icon">{c.icon}</span><strong>{c.title}</strong>{c.owner && <span title="Private">🔒</span>}</div>
                {c.description && <p className="muted small">{c.description}</p>}
                <div className="topic-foot">
                  <span className="muted small">{c.stats.total ? `${c.stats.total} pages` : 'Empty: add the first page'}{c.children.length ? ` · ${c.children.length} topics` : ''}</span>
                  {c.stats.total > 0 && <span className="small">{pct(c.stats)}%</span>}
                </div>
                {c.stats.total > 0 && <div className="topic-bar"><div style={{ width: `${pct(c.stats)}%`, background: c.color }} /></div>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="list-title">Pages</h2>
        {node.pages.length ? (
          <ol className="page-list">
            {node.pages.map((p) => (
              <li key={p._id}>
                <Link to={`/q/${p._id}`}>
                  <span className={`status-dot status-${p.status}`} title={STATUS_LABEL[p.status]}>{STATUS_LABEL[p.status].slice(0, 1)}</span>
                  <span className="page-list-title">{p.title}</span>
                  {p.owner && <span title="Private">🔒</span>}
                  {p.priority === 3 && <span title="Must know">🔥</span>}
                  {p.starred && <span title="Starred">★</span>}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty">
            No pages here yet.{' '}
            <button className="btn btn-primary" onClick={() => setModal({ type: 'page' })}>📄 Write the first one</button>
            {!isAdmin && <div className="muted small">Your pages are private to you.</div>}
          </div>
        )}
      </section>

      {modal?.type === 'import' && (
        <Suspense fallback={null}>
          <ImportModal node={node} onClose={() => setModal(null)} />
        </Suspense>
      )}
      {modal?.type === 'section' && (
        <SectionFormModal parent={node._id} roots={tree.roots} isAdmin={isAdmin} onClose={() => setModal(null)}
          onSubmit={(body) => sections.create.mutate(body, done((n) => { setModal(null); toast('Category created'); navigate(`/c/${n._id}`); }))} />
      )}
      {modal?.type === 'edit' && (
        <SectionFormModal initial={node} parent={node.parent} roots={tree.roots} isAdmin={isAdmin} onClose={() => setModal(null)}
          onSubmit={(body) => sections.update.mutate({ id: node._id, ...body }, done(() => { setModal(null); toast('Saved'); }))} />
      )}
      {modal?.type === 'page' && (
        <QuestionFormModal sectionTitle={node.title} isAdmin={isAdmin} onClose={() => setModal(null)}
          onSubmit={(body) => questions.create.mutate({ ...body, section: node._id }, done((q) => { setModal(null); navigate(`/q/${q._id}?edit=1`); }))} />
      )}
    </div>
  );
}
