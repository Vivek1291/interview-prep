import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTerms } from '../api/hooks';
import { useApp } from '../AppContext';
import TermFormModal from '../components/TermFormModal';
import { inlineMarkdown } from '../utils/html';

// 📖 Terms: every glossary term A→Z with its one-line summary, for quick revision.
export default function TermsPage() {
  const { data: terms = [], isLoading } = useTerms();
  const { openTerm } = useApp();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return terms;
    return terms.filter((t) => [t.term, ...(t.aliases || []), t.summary].some((x) => x?.toLowerCase().includes(s)));
  }, [terms, q]);
  const groups = useMemo(() => {
    const g = new Map();
    for (const t of shown) {
      const letter = /[a-z]/i.test(t.term[0]) ? t.term[0].toUpperCase() : '#';
      g.set(letter, [...(g.get(letter) || []), t]);
    }
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="page terms-page">
      <div className="q-header">
        <div>
          <h1>📖 Terms</h1>
          <p className="muted">Short explanations of the words that keep coming up (libuv, hydration, idempotent…). They are linked inside pages: click a <span className="term-link demo">term</span> to read it.</p>
        </div>
        <div className="q-actions"><button className="btn btn-primary" onClick={() => setAdding(true)}>＋ New term</button></div>
      </div>

      <div className="terms-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${terms.length} terms…`} aria-label="Search terms" />
        <nav className="az" aria-label="Jump to letter">
          {groups.map(([l]) => <a key={l} href={`#letter-${l}`}>{l}</a>)}
        </nav>
      </div>

      {isLoading && <div className="skeleton" />}
      {!isLoading && !shown.length && <div className="empty">No terms match “{q}”. <button className="btn btn-sm" onClick={() => setAdding(true)}>＋ Add it</button></div>}
      {groups.map(([letter, list]) => (
        <section key={letter} id={`letter-${letter}`} className="term-group">
          <h2>{letter}</h2>
          <div className="term-list">
            {list.map((t) => (
              <div key={t._id} className="term-card">
                <div className="term-card-head">
                  <Link to={`/terms/${t._id}`}><strong>{t.term}</strong></Link>
                  {t.owner && <span title="Private">🔒</span>}
                  <button className="btn btn-sm" onClick={() => openTerm(t._id)} title="Quick look without leaving this page">👁 Quick look</button>
                </div>
                {!!t.aliases?.length && <div className="muted small">also: {t.aliases.join(', ')}</div>}
                {t.summary && <p className="small" dangerouslySetInnerHTML={{ __html: inlineMarkdown(t.summary) }} />}
              </div>
            ))}
          </div>
        </section>
      ))}
      {adding && <TermFormModal selection={q} openAfter="page" onClose={() => setAdding(false)} />}
    </div>
  );
}
