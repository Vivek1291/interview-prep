import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuickNotes, useQuestionMutations, useTree } from '../api/hooks';

export default function RevisePage() {
  const [section, setSection] = useState('');
  const [mustOnly, setMustOnly] = useState(false);
  const [hideConfident, setHideConfident] = useState(false);
  const { data: tree = [] } = useTree();
  const { data = [], isLoading } = useQuickNotes(section);
  const { removeNote } = useQuestionMutations();

  const items = data.filter((q) => (!mustOnly || q.priority === 3) && (!hideConfident || q.status !== 'confident'));
  const groups = [];
  for (const q of items) {
    const last = groups[groups.length - 1];
    if (last && last.section._id === q.section._id) last.items.push(q);
    else groups.push({ section: q.section, items: [q] });
  }
  const noteCount = items.reduce((n, q) => n + q.quickNotes.length, 0);

  return (
    <div className="page revise">
      <div className="revise-head">
        <div>
          <h1>⚡ Quick Revise</h1>
          <p className="muted">{noteCount} notes across {items.length} questions. Read these in 15 minutes before your interview.</p>
        </div>
        <div className="revise-filters">
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {tree.map((s) => <option key={s._id} value={s._id}>{s.icon} {s.title}</option>)}
          </select>
          <label><input type="checkbox" checked={mustOnly} onChange={(e) => setMustOnly(e.target.checked)} /> 🔥 Must-know only</label>
          <label><input type="checkbox" checked={hideConfident} onChange={(e) => setHideConfident(e.target.checked)} /> Hide confident</label>
          <button className="btn btn-sm" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {isLoading && <div className="skeleton" />}
      {groups.map((g) => (
        <section key={g.section._id + g.items[0]._id} className="revise-section">
          <h2 style={{ color: g.section.color }}>{g.section.icon} {g.section.title}</h2>
          <div className="revise-grid">
            {g.items.map((q) => (
              <div key={q._id} className="revise-card" style={{ borderTopColor: g.section.color }}>
                <Link to={`/q/${q._id}`} className="revise-q">
                  {q.priority === 3 && '🔥 '}{q.title}
                </Link>
                <ul>
                  {q.quickNotes.map((n) => (
                    <li key={n.id} style={{ '--note': n.color }}>
                      <span dangerouslySetInnerHTML={{ __html: n.text }} />
                      <button className="note-x" title="Remove note" onClick={() => removeNote.mutate({ id: q._id, noteId: n.id })}>✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!isLoading && !groups.length && <div className="empty">No quick notes match. Open any question and add notes at the bottom.</div>}
    </div>
  );
}
