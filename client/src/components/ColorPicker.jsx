import { useEffect, useRef, useState } from 'react';

export const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6', '#64748b',
];

// Swatch button that opens a small popover with preset colours + a custom colour input.
export default function ColorPicker({ value, onChange, allowNone = true, label = 'Box colour', palette = PALETTE }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="color-picker" ref={ref}>
      <button
        type="button"
        className="swatch-btn"
        title={label}
        onClick={() => setOpen((o) => !o)}
        style={{ background: value || 'transparent' }}
      >
        {!value && '∅'}
      </button>
      {open && (
        <div className="color-pop">
          <div className="color-pop-label">{label}</div>
          <div className="swatches">
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${value === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false); }}
                aria-label={c}
              />
            ))}
          </div>
          <div className="color-pop-row">
            <label className="custom-color">
              🎨 Custom
              <input type="color" value={value || '#6366f1'} onChange={(e) => onChange(e.target.value)} />
            </label>
            {allowNone && (
              <button type="button" className="btn btn-sm" onClick={() => { onChange(''); setOpen(false); }}>
                None
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
