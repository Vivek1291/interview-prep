import { useState } from 'react';
import { useQuestionMutations } from '../api/hooks';
import { useApp } from '../AppContext';
import { noteToHtml } from '../utils/html';

export const NOTE_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe'];

export default function QuickNotes({ question }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const { addNote, removeNote } = useQuestionMutations();
  const { toast } = useApp();

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addNote.mutate({ id: question._id, text: noteToHtml(text.trim()), color }, { onSuccess: () => { setText(''); toast('Added to Quick Revise'); } });
  };

  return (
    <div className="quick-notes">
      <div className="qn-head">
        <h3>⚡ Quick revise notes</h3>
        <span className="muted small">Glance at these before the interview · tip: select any text above → “📌 Add to Quick Revise”</span>
      </div>
      <div className="qn-grid">
        {question.quickNotes?.map((n) => (
          <div key={n.id} className="sticky" style={{ background: n.color }}>
            <div dangerouslySetInnerHTML={{ __html: n.text }} />
            <button className="sticky-x" title="Remove" onClick={() => removeNote.mutate({ id: question._id, noteId: n.id })}>✕</button>
          </div>
        ))}
        {!question.quickNotes?.length && <div className="muted small">No quick notes yet.</div>}
      </div>
      <form className="qn-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a one-line revision note… (**bold**, `code`, ==highlight== supported)" />
        <div className="qn-colors">
          {NOTE_COLORS.map((c) => (
            <button type="button" key={c} className={`swatch ${c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        <button className="btn btn-primary" disabled={addNote.isPending}>Add</button>
      </form>
    </div>
  );
}
