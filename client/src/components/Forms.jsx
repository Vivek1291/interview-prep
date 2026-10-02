import { useState } from 'react';
import Modal from './Modal';
import ColorPicker from './ColorPicker';
import { flatNodes } from '../utils/tree';

const ICONS = ['📘', '🎨', '⚙️', '🏗️', '🚀', '🧪', '🧮', '🟨', '🔷', '⚛️', '▲', '🟢', '☕', '🗄️', '🍃', '🐘', '🔗', '☁️', '🐳', '🔐', '🧩', '🧠', '⚡', '🔥', '⭐', '📝', '📂', '🌐'];

/** <select> of categories, indented by depth. Admins can only nest shared content under shared categories. */
export function NodeSelect({ roots, value, onChange, exclude, allowRoot, isAdmin, id }) {
  const options = flatNodes(roots, { exclude }).filter((n) => !isAdmin || !n.owner);
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowRoot && <option value="">— Top level —</option>}
      {options.map((n) => (
        <option key={n._id} value={n._id}>{'  '.repeat(n.depth)}{n.icon} {n.title}{n.owner ? ' 🔒' : ''}</option>
      ))}
    </select>
  );
}

export function SectionFormModal({ initial, parent, roots, isAdmin, onSubmit, onClose }) {
  const [form, setForm] = useState({ title: '', icon: '📘', color: '#6366f1', description: '', ...initial, parent: parent ?? null });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const editing = !!initial?._id;
  return (
    <Modal title={editing ? 'Edit category' : 'New category'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          onSubmit({ title: form.title.trim(), icon: form.icon, color: form.color, description: form.description, parent: form.parent || null });
        }}
      >
        <label>Title<input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Polyfills" /></label>
        <label htmlFor="parent-select">Location</label>
        <NodeSelect id="parent-select" roots={roots} value={form.parent} onChange={set('parent')} exclude={initial?._id} allowRoot isAdmin={isAdmin} />
        <label>Icon</label>
        <div className="icon-grid">
          {ICONS.map((i) => (
            <button type="button" key={i} className={`icon-choice ${form.icon === i ? 'active' : ''}`} onClick={() => set('icon')(i)}>{i}</button>
          ))}
        </div>
        <div className="form-row">
          <span>Colour</span>
          <ColorPicker value={form.color} onChange={set('color')} allowNone={false} label="Category colour" />
        </div>
        <label>Description<textarea rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="What will someone learn here?" /></label>
        {!editing && <p className="muted small">{isAdmin ? 'Shared: every user will see this category.' : 'Private: only you will see this category.'}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuestionFormModal({ sectionTitle, isAdmin, onSubmit, onClose }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(2);
  return (
    <Modal title={`New page${sectionTitle ? ` in “${sectionTitle}”` : ''}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onSubmit({ title: title.trim(), priority });
        }}
      >
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Promise polyfill, or: What is a closure?" /></label>
        <label>Importance</label>
        <div className="priority-choice">
          {[3, 2, 1].map((p) => (
            <button type="button" key={p} className={`btn ${priority === p ? 'btn-primary' : ''}`} onClick={() => setPriority(p)}>
              {'⭐'.repeat(p)} {p === 3 ? 'Must know' : p === 2 ? 'Important' : 'Good to know'}
            </button>
          ))}
        </div>
        <p className="muted small">{isAdmin ? 'Shared: every user will see this page.' : 'Private: only you will see this page.'}</p>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}
