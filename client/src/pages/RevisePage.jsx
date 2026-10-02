import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuickNotes, useQuestionMutations, useTree } from '../api/hooks';
import { NodeSelect } from '../components/Forms';

export default function RevisePage() {
  const [node, setNode] = useState('');
  const [mustOnly, setMustOnly] = useState(false);
  const [hideConfident, setHideConfident] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const { data: tree } = useTree();
  const { data = [], isLoading } = useQuickNotes(node);
  const m = useQuestionMutations();

  const items = data
    .filter((q) => (!mustOnly || q.priority === 3) && (!hideConfident || q.status !== 'confident'))
    .map((q) => ({ ...q, authorNotes: mineOnly ? [] : q.authorNotes }))
    .filter((q) => q.authorNotes.length || q.myNotes.length);
  const groups = [];
  for (const q of items) {
    const last = groups[groups.length - 1];
    if (last && last.section._id === q.section._id) last.items.push(q);
    else groups.push({ section: q.section, path: q.path, items: [q] });
  }
  const noteCount = items.reduce((n, q) => n + q.authorNotes.length + q.myNotes.length, 0);

  return (
    <div className="page revise">
      <div className="revise-head">
        <div>
          <h1>⚡ Quick Revise</h1>
          <p className="muted">{noteCount} notes across {items.length} pages. Skim these before an interview or a test.</p>
        </div>
        <div className="revise-filters">
          <NodeSelect roots={tree?.roots || []} value={node} onChange={(v) => setNode(v || '')} allowRoot />
          <label><input type="checkbox" checked={mustOnly} onChange={(e) => setMustOnly(e.target.checked)} /> 🔥 Must-know only</label>
          <label><input type="checkbox" checked={hideConfident} onChange={(e) => setHideConfident(e.target.checked)} /> Hide confident</label>
          <label><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only my notes</label>
          <button className="btn btn-sm" onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {isLoading && <div className="skeleton" />}
      {groups.map((g) => (
        <section key={g.section._id + g.items[0]._id} className="revise-section">
          <h2 style={{ color: g.section.color }}>{g.section.icon} {g.path.join(' › ')}</h2>
          <div className="revise-grid">
            {g.items.map((q) => (
              <div key={q._id} className="revise-card" style={{ borderTopColor: g.section.color }}>
                <Link to={`/q/${q._id}`} className="revise-q">{q.priority === 3 && '🔥 '}{q.title}</Link>
                <ul>
                  {q.authorNotes.map((n) => (
                    <li key={n.id} style={{ '--note': n.color }}><span dangerouslySetInnerHTML={{ __html: n.text }} /></li>
                  ))}
                  {q.myNotes.map((n) => (
                    <li key={n.id} className="my-note" style={{ '--note': n.color }} title="My note">
                      <span dangerouslySetInnerHTML={{ __html: n.text }} />
                      <button className="note-x" title="Remove my note" onClick={() => m.removeMyNote.mutate({ id: q._id, noteId: n.id })}>✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!isLoading && !groups.length && <div className="empty">No quick notes match. Open any page and add notes at the bottom.</div>}
    </div>
  );
}
