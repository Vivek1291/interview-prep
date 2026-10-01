// Runs JavaScript in a sandboxed Web Worker and captures console output.
// A Worker runs on a separate thread → an infinite loop can't freeze the page; we terminate it after a timeout.
const WORKER_SRC = `
const fmt = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || String(v);
  if (typeof v === 'function') return v.toString();
  if (v instanceof Map) return 'Map(' + v.size + ') ' + safe(Object.fromEntries(v));
  if (v instanceof Set) return 'Set(' + v.size + ') ' + safe([...v]);
  return safe(v);
};
const safe = (v) => {
  try {
    const seen = new WeakSet();
    return JSON.stringify(v, (k, val) => {
      if (typeof val === 'object' && val !== null) { if (seen.has(val)) return '[Circular]'; seen.add(val); }
      if (val instanceof Error) return val.name + ': ' + val.message;
      if (typeof val === 'bigint') return val.toString() + 'n';
      if (val === undefined) return 'undefined';
      return val;
    });
  } catch (e) { return String(v); }
};
const send = (type, args) => postMessage({ type, text: args.map(fmt).join(' ') });
console.log = (...a) => send('log', a);
console.info = (...a) => send('log', a);
console.table = (...a) => send('log', a);
console.warn = (...a) => send('warn', a);
console.error = (...a) => send('error', a);
self.onunhandledrejection = (e) => send('error', ['Unhandled rejection: ', e.reason]);
self.onmessage = async (e) => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction(e.data)();
  } catch (err) {
    send('error', [err]);
  }
  setTimeout(() => postMessage({ type: 'done' }), 50);
};
`;

export function canRun(code, lang) {
  // Only plain JS that doesn't depend on Node modules or the DOM can run in the browser sandbox.
  return lang === 'javascript' && !/\brequire\(|^\s*import\s|^\s*export\s|process\.|module\.exports|app\.listen|document\.|window\.|\brouter\.|\bapp\.(use|get|post|put|patch|delete)\(|\bres\.(json|status|send)\(|mongoose|\bdb\.\w+\.|\b(User|Product|Order|Post|Model)\.\w+\(|\bs3\.|\bredis\.|\bjwt\./m.test(code);
}

export function runJs(code, onOutput, timeoutMs = 4000) {
  const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  let finished = false;
  const finish = (msg) => {
    if (finished) return;
    finished = true;
    if (msg) onOutput({ type: 'info', text: msg });
    onOutput({ type: 'done' });
    worker.terminate();
    URL.revokeObjectURL(url);
  };
  const timer = setTimeout(() => finish(`⏱ Stopped after ${timeoutMs / 1000}s (infinite loop or long timer?)`), timeoutMs);
  worker.onmessage = (e) => {
    if (e.data.type === 'done') {
      clearTimeout(timer);
      // allow pending timers (setTimeout demos) a moment to print
      setTimeout(() => finish(), 1500);
    } else onOutput(e.data);
  };
  worker.onerror = (e) => { onOutput({ type: 'error', text: e.message }); clearTimeout(timer); finish(); };
  worker.postMessage(code);
  return () => { clearTimeout(timer); finish('Stopped'); };
}
