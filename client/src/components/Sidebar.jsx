import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuestionMutations, useSearch, useSectionMutations, useTree } from '../api/hooks';
import useDebounce from '../hooks/useDebounce';
import { storage } from '../utils/storage';
import { pct } from '../utils/tree';
import { useApp } from '../AppContext';
import { useAuth } from '../auth/AuthProvider';
import { QuestionFormModal, SectionFormModal } from './Forms';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'must', label: '🔥 Must' },
  { key: 'starred', label: '★ Starred' },
  { key: 'todo', label: '📖 To learn' },
];
const PAGE_FILTERS = { all: () => true, must: (p) => p.priority === 3, starred: (p) => p.starred, todo: (p) => p.status !== 'confident' };
const STATUS_ICON = { new: '○', learning: '◐', revise: '↻', confident: '●' };

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

function SortableRow({ id, disabled, children, className }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ handle: disabled ? {} : { ...attributes, ...listeners } })}
    </div>
  );
}

/** A list of siblings that can be reordered by drag when the user may edit all of them. */
function SortableList({ items, onReorder, disabled, render, className }) {
  const sensors = useDndSensors();
  // Derived from props; after a drag we show the new order until the server's order arrives.
  // (Copying props into state with an effect re-rendered nested DnD contexts in a loop.)
  const idsKey = items.map((i) => i._id).join(',');
  const [optimistic, setOptimistic] = useState(null);       // { basis: idsKey, ids: [...] }
  const local = useMemo(() => {
    if (!optimistic || optimistic.basis !== idsKey) return items;
    const byId = new Map(items.map((i) => [i._id, i]));
    return optimistic.ids.map((id) => byId.get(id)).filter(Boolean);
  }, [items, idsKey, optimistic]);
  const ids = useMemo(() => local.map((i) => i._id), [local]);
  const canDrag = !disabled && local.length > 1 && local.every((i) => i.canEdit);
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    setOptimistic({ basis: idsKey, ids: next });
    onReorder(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {local.map((item) => (
          <SortableRow key={item._id} id={item._id} disabled={!canDrag} className={className}>
            {({ handle }) => render(item, canDrag ? handle : null)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function PageLink({ p, handle }) {
  return (
    <div className="q-row">
      {handle && <span className="drag-handle small" {...handle} title="Drag to reorder">⋮⋮</span>}
      <NavLink to={`/q/${p._id}`} className="q-link">
        <span className={`status-dot status-${p.status}`} title={p.status}>{STATUS_ICON[p.status]}</span>
        <span className="q-title">{p.title}</span>
        {p.owner && <span className="private-badge" title="Private: only you can see this">🔒</span>}
        {p.priority === 3 && <span className="must-dot" title="Must know">🔥</span>}
        {p.starred && <span title="Starred">★</span>}
      </NavLink>
    </div>
  );
}

function TreeNode({ node, handle, ctx }) {
  const { expanded, toggle, filterPage, filter, setModal, onDelete, sections, questions, activeId } = ctx;
  const open = !!expanded[node._id];
  const visiblePages = useMemo(() => (filter === 'all' ? node.pages : node.pages.filter(filterPage)), [node.pages, filter, filterPage]);
  const visibleChildren = useMemo(() => (filter === 'all' ? node.children : node.children.filter((c) => hasMatch(c, filterPage))), [node.children, filter, filterPage]);
  const count = filter === 'all' ? node.stats.total : countMatches(node, filterPage);
  return (
    <div className={`tree-node depth-${Math.min(node.depth, 4)}`}>
      <div className={`section-head ${activeId === node._id ? 'active' : ''}`} style={{ '--sec': node.color, paddingLeft: node.depth * 12 }}>
        {handle ? <span className="drag-handle" {...handle} title="Drag to reorder">⋮⋮</span> : <span className="drag-spacer" />}
        <button className="section-toggle" onClick={() => toggle(node._id)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.title}`}>
          <span className={`caret ${open ? 'open' : ''}`}>▸</span>
        </button>
        <NavLink to={`/c/${node._id}`} className="section-link" onClick={() => !open && toggle(node._id)}>
          <span className="section-icon">{node.icon}</span>
          <span className="section-title">{node.title}</span>
          {node.owner && <span className="private-badge" title="Private: only you can see this">🔒</span>}
        </NavLink>
        <span className="count" title={`${node.stats.confident} of ${node.stats.total} confident`}>{count}</span>
        <div className="section-actions">
          <button title="Add a sub-category or page" onClick={() => setModal({ type: 'add', node })}>＋</button>
          {node.canEdit && <button title="Edit or move" onClick={() => setModal({ type: 'section', section: node })}>✎</button>}
          {node.canEdit && <button title="Delete" onClick={() => onDelete(node)}>🗑</button>}
        </div>
      </div>
      {node.stats.total > 0 && (
        <div className="section-progress" style={{ marginLeft: 30 + node.depth * 12 }} title={`${pct(node.stats)}% confident`}>
          <div style={{ width: `${pct(node.stats)}%`, background: node.color }} />
        </div>
      )}
      {open && (
        <div className="node-children">
          <SortableList
            items={visibleChildren}
            disabled={filter !== 'all'}
            onReorder={(ids) => sections.reorder.mutate(ids)}
            render={(child, h) => <TreeNode node={child} handle={h} ctx={ctx} />}
          />
          {visiblePages.length > 0 && (
            <div className="questions" style={{ paddingLeft: 14 + node.depth * 12 }}>
              <SortableList
                items={visiblePages}
                disabled={filter !== 'all'}
                onReorder={(ids) => questions.reorder.mutate(ids)}
                render={(p, h) => <PageLink p={p} handle={h} />}
              />
            </div>
          )}
          {!visibleChildren.length && !visiblePages.length && (
            <div className="muted small pad" style={{ paddingLeft: 30 + node.depth * 12 }}>Nothing here yet</div>
          )}
        </div>
      )}
    </div>
  );
}

const hasMatch = (n, f) => n.pages.some(f) || n.children.some((c) => hasMatch(c, f));
const countMatches = (n, f) => n.pages.filter(f).length + n.children.reduce((s, c) => s + countMatches(c, f), 0);

export default function Sidebar() {
  const { data: tree, isLoading, error } = useTree();
  const roots = useMemo(() => tree?.roots || [], [tree]);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const { data: results = [], isFetching: searching } = useSearch(debounced);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(() => storage.get('expanded', {}));
  const [modal, setModal] = useState(null);
  const sections = useSectionMutations();
  const questions = useQuestionMutations();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useApp();
  const { isAdmin } = useAuth();

  const saveExpanded = (next) => { setExpanded(next); storage.set('expanded', next); };
  const toggle = (id) => saveExpanded({ ...expanded, [id]: !expanded[id] });

  // Open the path to whatever is on screen
  const activeId = location.pathname.startsWith('/c/') ? location.pathname.slice(3) : null;
  const pageId = location.pathname.startsWith('/q/') ? location.pathname.slice(3) : null;
  useEffect(() => {
    if (!tree) return;
    const nodeId = activeId || tree.pageById.get(pageId)?.section;
    const node = nodeId && tree.byId.get(nodeId);
    if (!node) return;
    const needed = node.path.filter((n) => !expanded[n._id] && (n._id !== activeId || pageId));
    if (needed.length) saveExpanded({ ...expanded, ...Object.fromEntries(needed.map((n) => [n._id, true])) });
  }, [tree, activeId, pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDelete = (n) => {
    const what = n.stats.total || n.children.length ? ` and everything in it (${n.stats.total} pages)` : '';
    if (!window.confirm(`Delete "${n.title}"${what}? This cannot be undone.${n.owner ? '' : '\nOther users\' private items inside will be moved to their "Recovered" folder.'}`)) return;
    sections.remove.mutate(n._id, {
      onSuccess: () => { toast('Category deleted'); if (activeId === n._id) navigate('/'); },
      onError: (e) => toast(e.message, 'error'),
    });
  };

  const ctx = useMemo(
    () => ({ expanded, toggle, filter, filterPage: PAGE_FILTERS[filter], setModal, onDelete, sections, questions, activeId }),
    [expanded, filter, activeId, sections, questions] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const visibleRoots = useMemo(() => (filter === 'all' ? roots : roots.filter((r) => hasMatch(r, PAGE_FILTERS[filter]))), [roots, filter]);
  const totalPages = tree?.pages.length || 0;
  const done = (body) => ({ onSuccess: body, onError: (e) => toast(e.message, 'error') });

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => navigate('/')}>
        <span className="brand-logo">🎯</span>
        <div>
          <div className="brand-title">Learning Hub</div>
          <div className="brand-sub">{totalPages} pages · {roots.length} areas</div>
        </div>
      </div>

      <div className="search">
        <input type="search" placeholder="🔍 Search pages, notes, code…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
      </div>

      {debounced.trim().length > 1 ? (
        <div className="search-results">
          <div className="muted small">{searching ? 'Searching…' : `${results.length} result(s)`}</div>
          {results.map((p) => <PageLink key={p._id} p={p} />)}
        </div>
      ) : (
        <>
          <div className="filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <nav className="tree" aria-label="Topics">
            {isLoading && <div className="muted pad">Loading…</div>}
            {error && <div className="error pad">⚠️ {error.message}</div>}
            <SortableList
              items={visibleRoots}
              disabled={filter !== 'all'}
              onReorder={(ids) => sections.reorder.mutate(ids)}
              render={(n, h) => <TreeNode node={n} handle={h} ctx={ctx} />}
              className="section"
            />
          </nav>
          <button className="btn btn-block add-section" onClick={() => setModal({ type: 'section', parent: null })}>
            ＋ New {isAdmin ? 'area' : 'private category'}
          </button>
        </>
      )}

      {modal?.type === 'add' && (
        <AddChoice
          node={modal.node}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onChoose={(kind) => setModal(kind === 'page' ? { type: 'question', node: modal.node } : { type: 'section', parent: modal.node._id })}
        />
      )}
      {modal?.type === 'section' && (
        <SectionFormModal
          initial={modal.section}
          parent={modal.section ? modal.section.parent : modal.parent}
          roots={roots}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSubmit={(body) => {
            if (modal.section) sections.update.mutate({ id: modal.section._id, ...body }, done(() => { toast('Saved'); setModal(null); }));
            else sections.create.mutate(body, done((n) => { toast(n.owner ? 'Private category created' : 'Category created'); setModal(null); if (body.parent) saveExpanded({ ...expanded, [body.parent]: true }); navigate(`/c/${n._id}`); }));
          }}
        />
      )}
      {modal?.type === 'question' && (
        <QuestionFormModal
          sectionTitle={modal.node.title}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSubmit={(body) =>
            questions.create.mutate({ ...body, section: modal.node._id }, done((q) => {
              setModal(null);
              toast(q.owner ? 'Private page created' : 'Page created');
              navigate(`/q/${q._id}?edit=1`);
            }))
          }
        />
      )}
    </aside>
  );
}

function AddChoice({ node, isAdmin, onClose, onChoose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Add to ${node.title}`} style={{ maxWidth: 420 }}>
        <div className="modal-header"><h3>Add to “{node.title}”</h3><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body add-choice">
          <button className="btn" onClick={() => onChoose('section')}>📁 Sub-category<span className="muted small">e.g. Polyfills → Promise</span></button>
          <button className="btn" onClick={() => onChoose('page')}>📄 Page<span className="muted small">a question, lesson or article</span></button>
          <p className="muted small">{isAdmin ? 'Admins add shared content: every user will see it.' : 'It will be private: only you can see and edit it.'}</p>
        </div>
      </div>
    </div>
  );
}
