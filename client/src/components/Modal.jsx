import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Accessible modal: portal, Escape to close, focus first field, click-outside to close.
export default function Modal({ title, onClose, children, width = 480 }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // focus the first field ONCE when the dialog opens (re-focusing on every render would steal focus while typing)
  useEffect(() => {
    ref.current?.querySelector('input:not([hidden]), textarea, select, button')?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
