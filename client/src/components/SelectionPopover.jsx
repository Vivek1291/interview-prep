import { useEffect, useState } from 'react';

// Shows floating buttons when the user selects text inside `containerRef`:
// "📌 Add to Quick Revise" and (optional) "📖 Add as term".
export default function SelectionPopover({ containerRef, onAdd, onAddTerm, onAskAi, disabled }) {
  const [pos, setPos] = useState(null);
  const [text, setText] = useState('');

  useEffect(() => {
    if (disabled) { setPos(null); return; }
    const onUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const t = sel?.toString().trim();
        if (!t || t.length < 3 || !sel.rangeCount || !containerRef.current?.contains(sel.anchorNode)) {
          setPos(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setText(t);
        setPos({ top: rect.top - 44, left: Math.min(Math.max(rect.left + rect.width / 2, 160), window.innerWidth - 160) });
      }, 10);
    };
    const onScroll = () => setPos(null);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [containerRef, disabled]);

  if (!pos) return null;
  const run = (fn, value) => { fn(value); setPos(null); window.getSelection()?.removeAllRanges(); };
  return (
    <div className="selection-pop" style={{ top: Math.max(pos.top, 8), left: pos.left }} onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => run(onAdd, text.length > 500 ? `${text.slice(0, 500)}…` : text)}>📌 Add to Quick Revise</button>
      {onAddTerm && <button type="button" onClick={() => run(onAddTerm, text)} title="Save this word as a glossary term you can open from anywhere">📖 Add as term</button>}
      {onAskAi && <button type="button" onClick={() => run(onAskAi, text.slice(0, 2000))} title="Ask the AI to explain the selected text">🤖 Ask AI</button>}
    </div>
  );
}
