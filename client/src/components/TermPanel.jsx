import { Suspense, lazy, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTerm } from '../api/hooks';
import { useApp } from '../AppContext';
import { inlineMarkdown } from '../utils/html';

const BlockView = lazy(() => import('./blocks/Block').then((m) => ({ default: m.BlockView })));

// Side panel that shows a glossary term without leaving the page you are reading.
export default function TermPanel() {
  const { openTermId, openTerm } = useApp();
  const { data: term, isLoading, error } = useTerm(openTermId);
  const closeRef = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!openTermId) return undefined;
    returnTo.current = returnTo.current || document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && openTerm(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openTermId, openTerm]);
  useEffect(() => {
    if (!openTermId && returnTo.current) { returnTo.current.focus?.(); returnTo.current = null; }
  }, [openTermId]);

  if (!openTermId) return null;
  return createPortal(
    <>
      <div className="term-panel-backdrop" onClick={() => openTerm(null)} />
      <aside className="term-panel" role="dialog" aria-modal="true" aria-label={term ? `Term: ${term.term}` : 'Term'}>
        <div className="term-panel-head">
          <span className="muted small">📖 Term</span>
          <div className="term-panel-actions">
            {term && <Link className="btn btn-sm" to={`/terms/${term._id}`} onClick={() => openTerm(null)}>Open page{term.canEdit ? ' / edit' : ''} →</Link>}
            <button className="icon-btn" ref={closeRef} onClick={() => openTerm(null)} aria-label="Close (Esc)">✕</button>
          </div>
        </div>
        {isLoading && <div className="skeleton" />}
        {error && <div className="error">⚠️ {error.message}</div>}
        {term && (
          <div className="term-panel-body">
            <h2>{term.term} {term.owner && <span className="private-pill">🔒 Private</span>}</h2>
            {!!term.aliases?.length && <p className="muted small">also: {term.aliases.join(', ')}</p>}
            {term.summary && <p className="term-summary" dangerouslySetInnerHTML={{ __html: inlineMarkdown(term.summary) }} />}
            <Suspense fallback={<div className="skeleton" />}>
              <div className="blocks">{term.blocks.map((b) => <BlockView key={b.id} block={b} />)}</div>
            </Suspense>
          </div>
        )}
      </aside>
    </>,
    document.body,
  );
}
