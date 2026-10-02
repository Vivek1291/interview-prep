import { useState } from 'react';
import { api } from '../../api/client';
import { useApp } from '../../AppContext';
import { Zoomable } from '../ZoomViewer';

// ---------- Image ----------
// content = one image URL per line
export function ImageView({ block }) {
  const urls = (block.content || '').split('\n').map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return <div className="muted">No image yet.</div>;
  const alt = block.title || 'image';
  const items = urls.map((u, i) => ({
    key: u,
    src: u,
    title: urls.length > 1 ? `${alt} (${i + 1}/${urls.length})` : alt,
    render: ({ width, height }) => <img src={u} alt={alt} width={width} height={height} draggable={false} />,
  }));
  return (
    <Zoomable items={items} label="Zoom image">
      <div className="images">
        {urls.map((u, i) => (
          <img key={u} src={u} alt={alt} loading="lazy" data-zoom-index={i} title="Click to zoom" />
        ))}
      </div>
    </Zoomable>
  );
}

export function ImageEdit({ block, onChange }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await api.upload(file);
      onChange({ content: [block.content, url].filter(Boolean).join('\n') });
      toast('Image uploaded');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  return (
    <div>
      <div className="edit-row">
        <label className="btn btn-sm">
          {busy ? 'Uploading…' : '⬆ Upload image'}
          <input type="file" accept="image/*" hidden onChange={upload} disabled={busy} />
        </label>
        <span className="muted small">…or paste image URLs below (one per line)</span>
      </div>
      <textarea className="mono-area" rows={3} value={block.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="https://…/diagram.png" />
      <ImageView block={block} />
    </div>
  );
}

// ---------- Links ----------
// content = lines of "Label | https://url"
export function parseLinks(text) {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.lastIndexOf('|');
      if (idx === -1) return { label: l, url: l };
      return { label: l.slice(0, idx).trim(), url: l.slice(idx + 1).trim() };
    });
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
};

export function LinksView({ block }) {
  const links = parseLinks(block.content);
  return (
    <div className="links">
      {links.map((l, i) => (
        <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="link-card">
          <span className="link-label">{l.label}</span>
          <span className="link-host">{hostOf(l.url)} ↗</span>
        </a>
      ))}
    </div>
  );
}

export function LinksEdit({ block, onChange }) {
  const links = parseLinks(block.content);
  const write = (list) => onChange({ content: list.map((l) => `${l.label} | ${l.url}`).join('\n') });
  return (
    <div className="links-edit">
      {links.map((l, i) => (
        <div key={i} className="link-row">
          <input value={l.label} placeholder="Label" onChange={(e) => write(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <input value={l.url} placeholder="https://…" onChange={(e) => write(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <button type="button" className="icon-btn" onClick={() => write(links.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => write([...links, { label: 'New link', url: 'https://' }])}>＋ Add link</button>
    </div>
  );
}
