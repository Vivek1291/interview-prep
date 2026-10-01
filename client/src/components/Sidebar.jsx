import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuestionMutations, useSearch, useSectionMutations, useTree } from '../api/hooks';
import useDebounce from '../hooks/useDebounce';
import { storage } from '../utils/storage';
import { useApp } from '../AppContext';
import { QuestionFormModal, SectionFormModal } from './Forms';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'must', label: '⭐⭐⭐ Must' },
  { key: 'starred', label: '★ Starred' },
  { key: 'todo', label: '📖 To learn' },
];
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

function QuestionLink({ q, handle, dnd }) {
  return (
    <div className="q-row">
      {dnd && <span className="drag-handle small" {...handle} title="Drag to reorder">⋮⋮</span>}
      <NavLink to={`/q/${q._id}`} className="q-link">
        <span className={`status-dot status-${q.status}`} title={q.status}>{STATUS_ICON[q.status]}</span>
        <span className="q-title">{q.title}</span>
        {q.priority === 3 && <span className="must-dot" title="Must know">🔥</span>}
        {q.starred && <span title="Starred">★</span>}
      </NavLink>
    </div>
  );
}

export default function Sidebar() {
  const { data: tree = [], isLoading, error } = useTree();
  const [items, setItems] = useState([]);
  useEffect(() => setItems(tree), [tree]);

  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const { data: results = [], isFetching: searching } = useSearch(debounced);
  const [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(() => storage.get('collapsed', {}));
  const [modal, setModal] = useState(null);
  const sections = useSectionMutations();
  const questions = useQuestionMutations();
  const navigate = useNavigate();
  const { toast } = useApp();
  const sensors = useDndSensors();

  const toggle = (id) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    storage.set('collapsed', next);
  };

  const filterQ = useMemo(
    () => ({
      all: () => true,
      must: (q) => q.priority === 3,
      starred: (q) => q.starred,
      todo: (q) => q.status !== 'confident',
    })[filter],
    [filter]
  );

  const onSectionDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s._id === active.id);
    const newIndex = items.findIndex((s) => s._id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next); // optimistic update
    sections.reorder.mutate(next.map((s) => s._id));
  };

  const onQuestionDragEnd = (sectionId) => ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = items.map((s) => {
      if (s._id !== sectionId) return s;
      const oldIndex = s.questions.findIndex((q) => q._id === active.id);
      const newIndex = s.questions.findIndex((q) => q._id === over.id);
      return { ...s, questions: arrayMove(s.questions, oldIndex, newIndex) };
    });
    setItems(next);
    const sec = next.find((s) => s._id === sectionId);
    questions.reorder.mutate({ ids: sec.questions.map((q) => q._id), sectionId });
  };

  const deleteSection = (s) => {
    if (!window.confirm(`Delete section "${s.title}" and its ${s.questions.length} questions? This cannot be undone.`)) return;
    sections.remove.mutate(s._id, { onSuccess: () => toast('Section deleted') });
  };

  const totalQ = items.reduce((n, s) => n + s.questions.length, 0);

  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => navigate('/')}>
        <span className="brand-logo">🎯</span>
        <div>
          <div className="brand-title">Interview Prep</div>
          <div className="brand-sub">{totalQ} questions · Full-Stack</div>
        </div>
      </div>

      <div className="search">
        <input
          type="search"
          placeholder="🔍 Search questions, notes, code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {debounced.trim().length > 1 ? (
        <div className="search-results">
          <div className="muted small">{searching ? 'Searching…' : `${results.length} result(s)`}</div>
          {results.map((q) => (
            <QuestionLink key={q._id} q={q} />
          ))}
        </div>
      ) : (
        <>
          <div className="filters">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="tree">
            {isLoading && <div className="muted pad">Loading…</div>}
            {error && <div className="error pad">⚠️ {error.message}. Is the API running?</div>}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
              <SortableContext items={items.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                {items.map((s) => {
                  const visible = s.questions.filter(filterQ);
                  const confident = s.questions.filter((q) => q.status === 'confident').length;
                  const pct = s.questions.length ? Math.round((confident / s.questions.length) * 100) : 0;
                  if (filter !== 'all' && visible.length === 0) return null;
                  return (
                    <SortableRow key={s._id} id={s._id} className="section" disabled={filter !== 'all'}>
                      {({ handle }) => (
                        <>
                          <div className="section-head" style={{ '--sec': s.color }}>
                            <span className="drag-handle" {...handle} title="Drag to reorder sections">⋮⋮</span>
                            <button className="section-toggle" onClick={() => toggle(s._id)}>
                              <span className={`caret ${collapsed[s._id] ? '' : 'open'}`}>▸</span>
                              <span className="section-icon">{s.icon}</span>
                              <span className="section-title">{s.title}</span>
                              <span className="count">{visible.length}</span>
                            </button>
                            <div className="section-actions">
                              <button title="Add question" onClick={() => setModal({ type: 'question', section: s })}>＋</button>
                              <button title="Edit section" onClick={() => setModal({ type: 'section', section: s })}>✎</button>
                              <button title="Delete section" onClick={() => deleteSection(s)}>🗑</button>
                            </div>
                          </div>
                          <div className="section-progress" title={`${pct}% confident`}>
                            <div style={{ width: `${pct}%`, background: s.color }} />
                          </div>
                          {!collapsed[s._id] && (
                            <div className="questions">
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onQuestionDragEnd(s._id)}>
                                <SortableContext items={visible.map((q) => q._id)} strategy={verticalListSortingStrategy}>
                                  {visible.map((q) => (
                                    <SortableRow key={q._id} id={q._id} disabled={filter !== 'all'}>
                                      {({ handle }) => <QuestionLink q={q} handle={handle} dnd={filter === 'all'} />}
                                    </SortableRow>
                                  ))}
                                </SortableContext>
                              </DndContext>
                              {visible.length === 0 && <div className="muted small pad">No questions yet</div>}
                            </div>
                          )}
                        </>
                      )}
                    </SortableRow>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
          <button className="btn btn-block add-section" onClick={() => setModal({ type: 'section' })}>＋ New section</button>
        </>
      )}

      {modal?.type === 'section' && (
        <SectionFormModal
          initial={modal.section}
          onClose={() => setModal(null)}
          onSubmit={(body) => {
            const done = { onSuccess: () => { toast('Section saved'); setModal(null); }, onError: (e) => toast(e.message, 'error') };
            if (modal.section) sections.update.mutate({ id: modal.section._id, ...body }, done);
            else sections.create.mutate(body, done);
          }}
        />
      )}
      {modal?.type === 'question' && (
        <QuestionFormModal
          sectionTitle={modal.section.title}
          onClose={() => setModal(null)}
          onSubmit={(body) =>
            questions.create.mutate(
              { ...body, section: modal.section._id },
              {
                onSuccess: (q) => {
                  setModal(null);
                  toast('Question created');
                  navigate(`/q/${q._id}?edit=1`);
                },
                onError: (e) => toast(e.message, 'error'),
              }
            )
          }
        />
      )}
    </aside>
  );
}
