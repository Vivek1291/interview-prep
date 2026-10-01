import { useRef, useState } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, LANGUAGES } from '../../utils/prism';
import { canRun, runJs } from '../../utils/runJs';
import { useApp } from '../../AppContext';

export function CodeView({ block }) {
  const { practiceMode, toast } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(null);
  const runnable = canRun(block.content, block.lang);
  const hidden = practiceMode && !revealed;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.content);
      toast('Code copied');
    } catch {
      toast('Copy failed', 'error');
    }
  };

  const run = () => {
    setOutput([]);
    setRunning(true);
    stopRef.current = runJs(block.content, (msg) => {
      if (msg.type === 'done') return setRunning(false);
      setOutput((o) => [...(o || []), msg]);
    });
  };

  return (
    <div className="code-view">
      <div className="code-actions">
        <span className="lang-badge">{block.lang || 'code'}</span>
        {runnable && !hidden && (
          running ? (
            <button className="btn btn-sm" onClick={() => stopRef.current?.()}>■ Stop</button>
          ) : (
            <button className="btn btn-sm btn-run" onClick={run}>▶ Run</button>
          )
        )}
        <button className="btn btn-sm" onClick={copy}>⧉ Copy</button>
        {practiceMode && revealed && <button className="btn btn-sm" onClick={() => setRevealed(false)}>🙈 Hide</button>}
      </div>
      <div className={`code-wrap ${hidden ? 'blurred' : ''}`}>
        <pre className={`code language-${block.lang}`}>
          <code dangerouslySetInnerHTML={{ __html: highlight(block.content || '', block.lang || 'javascript') }} />
        </pre>
        {hidden && (
          <button className="reveal-btn" onClick={() => setRevealed(true)}>
            🏋️ Try writing it yourself first — <b>click to reveal the solution</b>
          </button>
        )}
      </div>
      {output && (
        <div className="console">
          <div className="console-head">
            <span>Console output</span>
            <button className="icon-btn" onClick={() => setOutput(null)}>✕</button>
          </div>
          {output.length === 0 && running && <div className="console-line muted">Running…</div>}
          {output.length === 0 && !running && <div className="console-line muted">(no output)</div>}
          {output.map((l, i) => (
            <div key={i} className={`console-line ${l.type}`}>{l.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CodeEdit({ block, onChange }) {
  return (
    <div className="code-edit">
      <div className="edit-row">
        <label>
          Language{' '}
          <select value={block.lang || 'javascript'} onChange={(e) => onChange({ lang: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <span className="muted small">Tip: Tab inserts spaces. Plain JS (no require/DOM) gets a ▶ Run button.</span>
      </div>
      <div className="code-editor-wrap">
        <Editor
          value={block.content}
          onValueChange={(content) => onChange({ content })}
          highlight={(code) => highlight(code, block.lang || 'javascript')}
          padding={14}
          tabSize={2}
          insertSpaces
          className="code-editor"
          textareaClassName="code-textarea"
          placeholder="// write your code here"
        />
      </div>
    </div>
  );
}
