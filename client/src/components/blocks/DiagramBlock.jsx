import { useEffect, useId, useState } from 'react';
import { useApp } from '../../AppContext';

let mermaidPromise = null;
let lastTheme = null;
async function getMermaid(theme) {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default);
  const mermaid = await mermaidPromise;
  if (lastTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: 'Inter, system-ui, sans-serif',
      flowchart: { curve: 'basis', htmlLabels: true },
    });
    lastTheme = theme;
  }
  return mermaid;
}

let counter = 0;

// Renders Mermaid source (flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram…) to SVG.
export function DiagramView({ source }) {
  const { theme } = useApp();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    let cancelled = false;
    let renderId = '';
    if (!source?.trim()) { setSvg(''); setError(''); return; }
    const t = setTimeout(async () => {
      try {
        const mermaid = await getMermaid(theme);
        renderId = `m${baseId}${++counter}`;
        const { svg: out } = await mermaid.render(renderId, source);
        if (!cancelled) { setSvg(out); setError(''); }
      } catch (e) {
        // mermaid can leave a temporary error element in <body> — remove it
        document.getElementById(`d${renderId}`)?.remove();
        document.getElementById(renderId)?.remove();
        if (!cancelled) setError(e?.message || String(e));
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [source, theme, baseId]);

  if (error) {
    return (
      <div className="diagram-error">
        <div>⚠️ Diagram syntax error: <span className="muted">{error.split('\n')[0]}</span></div>
        <pre>{source}</pre>
      </div>
    );
  }
  return <div className="diagram" dangerouslySetInnerHTML={{ __html: svg || '<span class="muted">Rendering…</span>' }} />;
}

const TEMPLATES = {
  Flowchart: 'flowchart TD\n  A[Client] --> B[API]\n  B --> C[(Database)]',
  Sequence: 'sequenceDiagram\n  participant R as React\n  participant N as Node\n  R->>N: GET /users\n  N-->>R: 200 JSON',
  Class: 'classDiagram\n  class User {\n    +String name\n    +login()\n  }',
  ER: 'erDiagram\n  USER ||--o{ ORDER : places',
  State: 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Success\n  Pending --> Failed',
};

export function DiagramEdit({ block, onChange }) {
  return (
    <div className="split-edit">
      <div>
        <div className="edit-row">
          <span className="muted small">
            Mermaid syntax · <a href="https://mermaid.js.org/intro/" target="_blank" rel="noreferrer">docs</a> · Templates:
          </span>
          {Object.entries(TEMPLATES).map(([k, v]) => (
            <button key={k} type="button" className="btn btn-sm" onClick={() => onChange({ content: v })}>{k}</button>
          ))}
        </div>
        <textarea className="mono-area" rows={10} value={block.content} onChange={(e) => onChange({ content: e.target.value })} />
      </div>
      <div className="preview-pane">
        <div className="muted small">Live preview</div>
        <DiagramView source={block.content} />
      </div>
    </div>
  );
}
