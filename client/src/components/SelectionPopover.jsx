import { useEffect, useState } from 'react';

// Shows a floating "Add to Quick Revise" button when the user selects text inside `containerRef`.
export default function SelectionPopover({ containerRef, onAdd, disabled }) {
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
        setPos({ top: rect.top - 44, left: Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110) });
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
  return (
    <button
      className="selection-pop"
      style={{ top: Math.max(pos.top, 8), left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onAdd(text.length > 500 ? `${text.slice(0, 500)}…` : text);
        setPos(null);
        window.getSelection()?.removeAllRanges();
      }}
    >
      📌 Add to Quick Revise
    </button>
  );
}
