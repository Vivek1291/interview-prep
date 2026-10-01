import { useState } from 'react';
import Modal from './Modal';
import ColorPicker from './ColorPicker';

const ICONS = ['📘', '🟢', '🚂', '🌐', '🍃', '📊', '🦫', '🧪', '☁️', '🪣', '🔐', '🚀', '🔗', '🎨', '⚙️', '🧩', '🧮', '⚡', '🧠', '🔥', '⭐', '📝'];

export function SectionFormModal({ initial, onSubmit, onClose }) {
  const [form, setForm] = useState({ title: '', icon: '📘', color: '#6366f1', description: '', ...initial });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={initial?._id ? 'Edit section' : 'New section'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          onSubmit({ title: form.title.trim(), icon: form.icon, color: form.color, description: form.description });
        }}
      >
        <label>Title<input value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. React Hooks" /></label>
        <label>Icon</label>
        <div className="icon-grid">
          {ICONS.map((i) => (
            <button type="button" key={i} className={`icon-choice ${form.icon === i ? 'active' : ''}`} onClick={() => set('icon')(i)}>{i}</button>
          ))}
        </div>
        <div className="form-row">
          <span>Colour</span>
          <ColorPicker value={form.color} onChange={set('color')} allowNone={false} label="Section colour" />
        </div>
        <label>Description<textarea rows={2} value={form.description} onChange={(e) => set('description')(e.target.value)} /></label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function QuestionFormModal({ sectionTitle, onSubmit, onClose }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(2);
  return (
    <Modal title={`New question${sectionTitle ? ` in “${sectionTitle}”` : ''}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) onSubmit({ title: title.trim(), priority });
        }}
      >
        <label>Question<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. What is a closure?" /></label>
        <label>Importance</label>
        <div className="priority-choice">
          {[3, 2, 1].map((p) => (
            <button type="button" key={p} className={`btn ${priority === p ? 'btn-primary' : ''}`} onClick={() => setPriority(p)}>
              {'⭐'.repeat(p)} {p === 3 ? 'Must know' : p === 2 ? 'Important' : 'Good to know'}
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}
