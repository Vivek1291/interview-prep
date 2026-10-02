import { useState } from 'react';
import { useQuestionMutations } from '../api/hooks';
import { useApp } from '../AppContext';
import { noteToHtml } from '../utils/html';

export const NOTE_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#ddd6fe'];

function Sticky({ note, onRemove }) {
  return (
    <div className="sticky" style={{ background: note.color }}>
      <div dangerouslySetInnerHTML={{ __html: note.text }} />
      {onRemove && <button className="sticky-x" title="Remove" onClick={onRemove}>✕</button>}
    </div>
  );
}

// Two kinds of notes: the author's (part of the page, everyone sees them) and my own (private).
export default function QuickNotes({ question }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [asAuthor, setAsAuthor] = useState(false);
  const m = useQuestionMutations();
  const { toast } = useApp();
  const mine = question.progress?.notes || [];

  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = { id: question._id, text: noteToHtml(text.trim()), color };
    const mutation = asAuthor && question.canEdit ? m.addAuthorNote : m.addMyNote;
    mutation.mutate(body, { onSuccess: () => { setText(''); toast(asAuthor ? 'Note added to the page' : 'Added to my Quick Revise'); }, onError: (err) => toast(err.message, 'error') });
  };

  return (
    <div className="quick-notes">
      <div className="qn-head">
        <h3>⚡ Quick revise notes</h3>
        <span className="muted small">Tip: select any text above → “📌 Add to Quick Revise”</span>
      </div>
      {question.quickNotes?.length > 0 && (
        <>
          <div className="qn-label">From the page{question.canEdit ? ' (you can edit these)' : ''}</div>
          <div className="qn-grid">
            {question.quickNotes.map((n) => (
              <Sticky key={n.id} note={n} onRemove={question.canEdit ? () => m.removeAuthorNote.mutate({ id: question._id, noteId: n.id }) : null} />
            ))}
          </div>
        </>
      )}
      <div className="qn-label">My notes <span className="muted small">(only you see these)</span></div>
      <div className="qn-grid">
        {mine.map((n) => <Sticky key={n.id} note={n} onRemove={() => m.removeMyNote.mutate({ id: question._id, noteId: n.id })} />)}
        {!mine.length && <div className="muted small">No personal notes yet.</div>}
      </div>
      <form className="qn-add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a one-line revision note… (**bold**, `code`, ==highlight== supported)" aria-label="New note" />
        <div className="qn-colors">
          {NOTE_COLORS.map((c) => (
            <button type="button" key={c} className={`swatch ${c === color ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
          ))}
        </div>
        {question.canEdit && (
          <label className="small"><input type="checkbox" checked={asAuthor} onChange={(e) => setAsAuthor(e.target.checked)} /> add to the page</label>
        )}
        <button className="btn btn-primary" disabled={m.addMyNote.isPending || m.addAuthorNote.isPending}>Add</button>
      </form>
    </div>
  );
}
