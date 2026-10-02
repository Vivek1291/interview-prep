import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Full-screen zoom & pan viewer for images, diagrams and charts.
//
// items: [{ key, title, size?: { w, h }, src?: imageUrl, render: ({ width, height, scale }) => node }]
//   - `size` is the natural (100 %) size. For images it is measured from the file when omitted.
//   - `render` draws the content at exactly width × height: zooming RESIZES the content instead of
//     CSS-scaling it, so SVGs and text stay crisp at any zoom (and chart tooltips keep working).
//
// Mouse / trackpad: wheel or pinch = zoom at the pointer, drag = move, double-click = zoom in / fit.
// Touch: pinch = zoom, one finger = move, double-tap = zoom in / fit.
// Keyboard: + / − zoom, 0 fit, 1 actual size, arrows move (or switch image when not zoomed in), Esc closes.

const PAD = 24;
const MAX_SCALE = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Natural size of an item. A measured size is tagged with its item's key, so after switching
// images we never use the previous image's size (even for the one render before it's measured).
function useNaturalSize(item) {
  const [measured, setMeasured] = useState(null); // { key, w, h, failed? }
  const { key, size, src } = item;
  useEffect(() => {
    if (size || !src) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setMeasured(img.naturalWidth ? { key, w: img.naturalWidth, h: img.naturalHeight } : { key, w: 1000, h: 625 });
    img.onerror = () => alive && setMeasured({ key, w: 1000, h: 625, failed: true });
    img.src = src;
    return () => { alive = false; };
  }, [key, size, src]);
  if (size) return size;
  if (!src) return { w: 1000, h: 625 };
  return measured?.key === key ? measured : null;
}

export default function ZoomViewer({ items, startIndex = 0, onClose, returnFocusRef }) {
  const [index, setIndex] = useState(startIndex);
  const item = items[index];
  const size = useNaturalSize(item);

  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [view, setView] = useState(null); // { s, x, y }
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- stage size ----
  useLayoutEffect(() => {
    const el = stageRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // jsdom / hidden layouts report 0: fall back to the window size
      setStage({ w: r.width || window.innerWidth, h: r.height || window.innerHeight - 56 });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = size && stage.w ? clamp(Math.min((stage.w - PAD * 2) / size.w, (stage.h - PAD * 2) / size.h), 0.05, 4) : 1;
  const minScale = Math.min(fitScale, 1) / 2;

  const centred = useCallback((s) => ({ s, x: (stage.w - size.w * s) / 2, y: (stage.h - size.h * s) / 2 }), [stage, size]);
  const fit = useCallback(() => size && setView(centred(fitScale)), [size, centred, fitScale]);
  const actual = useCallback(() => size && setView(centred(1)), [size, centred]);

  // reset to "fit" when the item or its size changes; keep the centre when only the window resizes
  const fittedFor = useRef(null);
  useEffect(() => {
    if (!size || !stage.w) return;
    if (fittedFor.current !== item.key) { fittedFor.current = item.key; fit(); }
  }, [size, stage, item.key, fit]);

  const zoomAt = useCallback((factor, px, py) => {
    setView((v) => {
      if (!v) return v;
      const s = clamp(v.s * factor, minScale, MAX_SCALE);
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, [minScale]);
  const zoomCentre = (factor) => zoomAt(factor, stage.w / 2, stage.h / 2);
  const pan = (dx, dy) => setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy });

  const go = useCallback((d) => setIndex((i) => (i + d + items.length) % items.length), [items.length]);
  const zoomedIn = view && view.s > fitScale * 1.05;

  // ---- wheel (non-passive so we can stop the page from scrolling) ----
  useEffect(() => {
    const el = stageRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // ctrlKey = trackpad pinch (small deltas): zoom faster
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015) * (e.deltaMode === 1 ? 33 : 1));
      zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---- drag / pinch with pointer events ----
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    stageRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
    setDragging(true);
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 1) {
      pan(e.clientX - prev.x, e.clientY - prev.y);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pts.values()];
    const r = stageRef.current.getBoundingClientRect();
    const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch.current) {
      pan(mid.x - pinch.current.mid.x, mid.y - pinch.current.mid.y);
      zoomAt(dist / pinch.current.dist, mid.x, mid.y);
    }
    pinch.current = { mid, dist };
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    if (!pointers.current.size) setDragging(false);
  };
  const onDoubleClick = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    if (zoomedIn) fit();
    else zoomAt((fitScale * 2.5) / viewRef.current.s, e.clientX - r.left, e.clientY - r.top);
  };

  // ---- keyboard, scroll lock, focus ----
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      // Safari doesn't focus a button on click, so prefer the explicit opener (the Zoom button)
      (returnFocusRef?.current || previous)?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'Tab') {                       // keep focus inside the dialog
        const f = [...dialogRef.current.querySelectorAll('button, a[href]')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const step = 80;
      const handled = {
        '+': () => zoomCentre(1.25), '=': () => zoomCentre(1.25), '-': () => zoomCentre(0.8), _: () => zoomCentre(0.8),
        0: fit, 1: actual,
        ArrowLeft: () => (items.length > 1 && !zoomedIn ? go(-1) : pan(step, 0)),
        ArrowRight: () => (items.length > 1 && !zoomedIn ? go(1) : pan(-step, 0)),
        ArrowUp: () => pan(0, step), ArrowDown: () => pan(0, -step),
      }[e.key];
      if (handled) { e.preventDefault(); handled(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const pctLabel = view ? `${Math.round(view.s * 100)}%` : '…';
  const title = item.title || 'Zoom';

  return createPortal(
    <div className="zoom-overlay" role="dialog" aria-modal="true" aria-label={`${title}: zoom view`} ref={dialogRef}>
      <div className="zoom-toolbar">
        <span className="zoom-title" title={title}>{title}</span>
        {items.length > 1 && (
          <span className="zoom-group">
            <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Previous image">‹</button>
            <span className="small muted">{index + 1} / {items.length}</span>
            <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Next image">›</button>
          </span>
        )}
        <span className="zoom-group">
          <button type="button" className="icon-btn" onClick={() => zoomCentre(0.8)} aria-label="Zoom out" title="Zoom out (−)">−</button>
          <button type="button" className="zoom-pct" onClick={fit} aria-label={`Zoom ${pctLabel}. Fit to screen`} title="Fit to screen (0)">{pctLabel}</button>
          <button type="button" className="icon-btn" onClick={() => zoomCentre(1.25)} aria-label="Zoom in" title="Zoom in (+)">＋</button>
          <button type="button" className="btn btn-sm zoom-hide-sm" onClick={fit} title="Fit to screen (0)">Fit</button>
          <button type="button" className="btn btn-sm zoom-hide-sm" onClick={actual} title="Actual size (1)">100%</button>
        </span>
        {item.src && <a className="btn btn-sm zoom-hide-sm" href={item.src} target="_blank" rel="noreferrer">↗ Original</a>}
        <button type="button" className="icon-btn zoom-close" onClick={onClose} ref={closeRef} aria-label="Close zoom (Esc)" title="Close (Esc)">✕</button>
      </div>

      <div
        className={`zoom-stage ${dragging ? 'dragging' : ''}`}
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {!size || !view ? (
          <div className="zoom-loading muted">Loading…</div>
        ) : size.failed ? (
          <div className="zoom-loading muted">⚠️ Could not load the image.</div>
        ) : (
          <div
            className="zoom-content"
            style={{ width: size.w * view.s, height: size.h * view.s, transform: `translate(${view.x}px, ${view.y}px)` }}
          >
            {item.render({ width: size.w * view.s, height: size.h * view.s, scale: view.s })}
          </div>
        )}
        <div className="zoom-hint small" aria-hidden="true">Scroll or pinch to zoom · drag to move · double-click to zoom · Esc to close</div>
      </div>
    </div>,
    document.body,
  );
}

/** Wraps a block view with a "⤢ Zoom" button (and optional click-to-zoom on the content). */
export function Zoomable({ items, children, clickToZoom = true, label = 'Zoom', className = '' }) {
  const [open, setOpen] = useState(null);
  const btnRef = useRef(null);
  const openAt = (i) => setOpen({ i });
  // a child can mark itself with data-zoom-index="n" to open that item (e.g. one image of several)
  const indexFrom = (target) => Number(target.closest('[data-zoom-index]')?.dataset.zoomIndex || 0);
  return (
    <div className={`zoomable ${className}`}>
      {clickToZoom ? (
        <div className="zoomable-click" onClick={(e) => { if (!e.target.closest('a,button')) openAt(indexFrom(e.target)); }}>{children}</div>
      ) : children}
      <button type="button" className="zoom-btn" ref={btnRef} onClick={() => openAt(0)} aria-label={`${label}: ${items[0]?.title || ''}`.trim()} title="Zoom (opens a full-screen view)">
        ⤢ <span>Zoom</span>
      </button>
      {open && <ZoomViewer items={items} startIndex={open.i} onClose={() => setOpen(null)} returnFocusRef={btnRef} />}
    </div>
  );
}
