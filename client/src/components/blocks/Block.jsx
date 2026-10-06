import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import RichTextEditor from './RichTextEditor';
import { CodeEdit, CodeView } from './CodeBlock';
import { DiagramEdit, DiagramView } from './DiagramBlock';
import { ChartEdit, ChartView } from './ChartBlock';
import { ImageEdit, ImageView, LinksEdit, LinksView } from './MediaBlocks';
import ColorPicker from '../ColorPicker';
import { uid } from '../../utils/id';

export const CALLOUT_PRESETS = {
  note: { label: '📝 Note', title: '📝 Note', color: '#eab308' },
  tip: { label: '💡 Tip', title: '💡 Tip', color: '#10b981' },
  important: { label: '⭐ Important', title: '⭐ Say this in the interview', color: '#ec4899' },
  warning: { label: '⚠️ Warning', title: '⚠️ Common mistakes', color: '#ef4444' },
  understand: { label: '🧠 Understand', title: '🧠 What you must understand', color: '#8b5cf6' },
  ask: { label: '❓ Ask interviewer', title: '❓ Ask the interviewer / Be cautious', color: '#f97316' },
  highlight: { label: '🖍️ Highlight box', title: '🖍️ Highlight', color: '#0ea5e9' },
};

export const BLOCK_TYPES = [
  { type: 'text', label: '📖 Rich text', make: () => ({ title: '📖 Answer', content: '' }) },
  ...Object.entries(CALLOUT_PRESETS).map(([variant, p]) => ({
    type: 'callout', label: p.label, make: () => ({ variant, title: p.title, color: p.color, content: '' }),
  })),
  { type: 'code', label: '💻 Code', make: () => ({ title: '💻 Code', lang: 'javascript', color: '#0ea5e9', content: '' }) },
  { type: 'diagram', label: '🗺️ Diagram', make: () => ({ title: '🗺️ Diagram', color: '#14b8a6', content: 'flowchart LR\n  A[Start] --> B[End]' }) },
  { type: 'chart', label: '📊 Chart', make: () => ({ title: '📊 Chart', chartType: 'bar', color: '#6366f1', content: 'label,Value\nA,10\nB,20\nC,15' }) },
  { type: 'image', label: '🖼️ Image', make: () => ({ title: '🖼️ Image', color: '#64748b', content: '' }) },
  { type: 'links', label: '🔗 Links', make: () => ({ title: '🔗 Learn more', color: '#64748b', content: '' }) },
];

export function newBlock(def) {
  return {
    id: uid(),
    type: def.type,
    title: '', content: '', color: '', variant: '', lang: '', chartType: '', collapsed: false,
    ...def.make(),
  };
}

function Body({ block }) {
  switch (block.type) {
    case 'code': return <CodeView block={block} />;
    case 'diagram': return <DiagramView source={block.content} title={block.title} />;
    case 'chart': return <ChartView block={block} />;
    case 'image': return <ImageView block={block} />;
    case 'links': return <LinksView block={block} />;
    default: return <div className="rich prose" dangerouslySetInnerHTML={{ __html: block.content }} />;
  }
}

// ---------------- VIEW MODE ----------------
// While the browser prints, folded blocks are rendered open (flushSync: the print snapshot is taken right after 'beforeprint').
function usePrinting() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  return printing;
}

export function BlockView({ block }) {
  const [collapsed, setCollapsed] = useState(!!block.collapsed);
  const printing = usePrinting();
  const style = block.color ? { '--bc': block.color } : undefined;
  return (
    <section className={`block block-${block.type} ${block.color ? 'colored' : ''} variant-${block.variant || 'none'}`} style={style}>
      {block.title && (
        <button className="block-title" onClick={() => setCollapsed((c) => !c)} title="Collapse / expand">
          <span>{block.title}</span>
          <span className={`caret ${collapsed ? '' : 'open'}`}>▸</span>
        </button>
      )}
      {(!collapsed || printing) && <div className="block-body"><Body block={block} /></div>}
    </section>
  );
}

// ---------------- EDIT MODE ----------------
export function BlockEditor({ block, index, total, onChange, onMove, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    ...(block.color ? { '--bc': block.color } : {}),
  };
  const set = (patch) => onChange({ ...block, ...patch });

  return (
    <section ref={setNodeRef} style={style} className={`block editing block-${block.type} ${block.color ? 'colored' : ''}`}>
      <div className="block-edit-head">
        <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder">⋮⋮</span>
        <input className="block-title-input" value={block.title} placeholder="Box title (optional)" onChange={(e) => set({ title: e.target.value })} />
        {block.type === 'callout' && (
          <select
            value={block.variant}
            title="Box style"
            onChange={(e) => {
              const p = CALLOUT_PRESETS[e.target.value];
              set({ variant: e.target.value, ...(p ? { color: p.color, title: p.title } : {}) });
            }}
          >
            {Object.entries(CALLOUT_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        )}
        <ColorPicker value={block.color} onChange={(color) => set({ color })} />
        <label className="collapse-check" title="Start collapsed when viewing">
          <input type="checkbox" checked={!!block.collapsed} onChange={(e) => set({ collapsed: e.target.checked })} /> fold
        </label>
        <div className="block-edit-actions">
          <button type="button" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" title="Duplicate" onClick={onDuplicate}>⧉</button>
          <button type="button" title="Delete block" className="danger" onClick={onDelete}>🗑</button>
        </div>
      </div>
      <div className="block-body">
        {(block.type === 'text' || block.type === 'callout') && (
          <RichTextEditor value={block.content} onChange={(content) => set({ content })} />
        )}
        {block.type === 'code' && <CodeEdit block={block} onChange={set} />}
        {block.type === 'diagram' && <DiagramEdit block={block} onChange={set} />}
        {block.type === 'chart' && <ChartEdit block={block} onChange={set} />}
        {block.type === 'image' && <ImageEdit block={block} onChange={set} />}
        {block.type === 'links' && <LinksEdit block={block} onChange={set} />}
      </div>
    </section>
  );
}

export function AddBlockMenu({ onAdd, compact }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`add-block ${compact ? 'compact' : ''}`}>
      {!open ? (
        <button type="button" className="add-block-btn" onClick={() => setOpen(true)}>＋ Add block here</button>
      ) : (
        <div className="add-block-menu">
          {BLOCK_TYPES.map((t) => (
            <button type="button" key={t.label} className="btn btn-sm" onClick={() => { onAdd(newBlock(t)); setOpen(false); }}>
              {t.label}
            </button>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </div>
  );
}
