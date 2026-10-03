#!/usr/bin/env node
// Verifies the seed content in server/src/seed/content/*.md. Uses only Node built-ins.
//
//   node scripts/verify-content.js            # all sections
//   node scripts/verify-content.js 16         # only files whose name contains "16"
//   SHOW=1 node scripts/verify-content.js 16  # also print the output of every runnable example
//
// FAILURES (exit code 1) = things that are broken for the reader:
//   parse errors, runnable JS that throws / prints "❌" / times out, JS/JSON syntax errors,
//   bare == in prose, broken tables, invalid charts, risky Mermaid syntax, missing or malformed images.
// WARNINGS = the question doesn't meet the content standard in docs/content-format.md yet
//   (missing blocks, too few visuals, placeholders in code, no ✅ tests…).
//
// Optional: if `esbuild` can be resolved (client/node_modules or ESBUILD_PATH), JSX/TS blocks are syntax-checked too.

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'server/src/seed/content');
const TERMS_FILE = path.join(ROOT, 'server/src/seed/terms.md');   // glossary: format checks only, no content standard
const PUBLIC_DIR = path.join(ROOT, 'client/public');
const RUNJS_FILE = path.join(ROOT, 'client/src/utils/runJs.js');
const { parseFile } = require(path.join(ROOT, 'server/src/seed/parser.js'));

const SHOW = !!process.env.SHOW;
const filter = process.argv[2] || '';
const RUN_TIMEOUT_MS = 6000;
const MAX_SVG_BYTES = 20 * 1024;

// ---------------------------------------------------------------------------
// Keep this function IDENTICAL to canRun() in client/src/utils/runJs.js (checked below).
function canRun(code, lang) {
  // Only plain JS that doesn't depend on Node modules or the DOM can run in the browser sandbox.
  return lang === 'javascript' && !/\brequire\(|^\s*import\s|^\s*export\s|process\.|module\.exports|app\.listen|document\.|window\.|\brouter\.|\bapp\.(use|get|post|put|patch|delete)\(|\bres\.(json|status|send)\(|mongoose|\bdb\.\w+\.|\b(User|Product|Order|Post|Model)\.\w+\(|\bs3\.|\bredis\.|\bjwt\./m.test(code);
}

// ---------------------------------------------------------------------------
// Section kinds decide which content standard applies (docs/content-format.md).
function kindOf(file) {
  const n = Number(file.slice(0, 2));
  if (n === 12 || (n >= 16 && n <= 21)) return 'dsa';
  if (n >= 13 && n <= 15) return 'lld';
  return 'concept';
}

// Raw (markdown) blocks: the parser converts text to HTML, but the format checks need the source.
function rawBlocks(text) {
  const out = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let q = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^===\s+(.*)$/))) { q = { title: m[1].trim(), quick: [], blocks: [], tags: [] }; out.push(q); continue; }
    if (!q) continue;
    if ((m = line.match(/^@tags\s+(.*)$/))) q.tags = m[1].split(',').map((t) => t.trim());
    if (line.startsWith('@quick')) {
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) q.quick.push(lines[++i].trim().slice(2));
      continue;
    }
    if ((m = line.match(/^:::\s*(\S.*)$/))) {
      const header = m[1].trim();
      const startLine = i + 1;
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      const parts = header.split(/\s+/);
      q.blocks.push({ kind: parts[0], header, body: body.join('\n'), line: startLine });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prose checks
const stripCode = (s) => s.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));

function checkProse(text, where, fail) {
  const lines = text.split('\n');
  lines.forEach((ln, idx) => {
    if (/^\s*```/.test(ln)) fail(`${where}: fenced code (\`\`\`) isn't supported in text blocks: use inline \`code\` lines or a ::: code block (line ${idx + 1})`);
    const noCode = stripCode(ln);
    // remove deliberate highlights: ==text== or ==[#hex]text== (no space right inside the markers)
    const noHl = noCode.replace(/==(\[#[0-9a-fA-F]{3,8}\])?[^=\s](?:[^=]*?[^=\s])?==/g, '');
    if (/==/.test(noHl)) fail(`${where}: bare "==" in prose (line ${idx + 1}): put equality in backticks → ${ln.trim().slice(0, 90)}`);
    const opens = (noCode.match(/\{color:/g) || []).length;
    const closes = (noCode.match(/\{\/color\}/g) || []).length;
    if (opens !== closes) fail(`${where}: unbalanced {color:…}{/color} (line ${idx + 1})`);
  });
  // tables: every row must have the header's cell count; 2nd row must be the |---| separator
  const cells = (r) => {
    const s = r.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = [];
    let cur = '', inCode = false;
    for (const ch of s) {
      if (ch === '`') inCode = !inCode;
      if (ch === '|' && !inCode) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
    const width = cells(rows[0]).length;
    if (rows.length < 2 || !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(rows[1].trim())) {
      fail(`${where}: table "${rows[0].trim().slice(0, 50)}" has no |---| separator as its 2nd row`);
      continue;
    }
    rows.forEach((r, k) => {
      const n = cells(r).length;
      if (n !== width) fail(`${where}: table row ${k + 1} has ${n} cells, header has ${width} (a "|" outside backticks?) → ${r.trim().slice(0, 80)}`);
    });
  }
}

const hasTable = (md) => /^\s*\|.*\|\s*$/m.test(md) && /^\s*\|?\s*:?-{3,}/m.test(md);

// ---------------------------------------------------------------------------
// Mermaid checks (heuristics for the rules in docs/content-format.md, rule 4)
const MERMAID_HEADERS = /^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b|^sequenceDiagram\b|^stateDiagram-v2\b|^classDiagram\b|^erDiagram\b/;

function checkMermaid(src, where, fail) {
  const lines = src.split('\n').map((l) => l.replace(/%%.*$/, ''));
  const first = lines.find((l) => l.trim());
  if (!first || !MERMAID_HEADERS.test(first.trim())) { fail(`${where}: Mermaid must start with flowchart TD|LR, sequenceDiagram, stateDiagram-v2, classDiagram or erDiagram (got "${(first || '').trim()}")`); return; }
  const type = first.trim().split(/\s+/)[0];
  const body = lines.slice(lines.indexOf(first) + 1);

  if (type === 'flowchart' || type === 'graph') {
    const subgraphs = new Set();
    const nodes = new Set();
    body.forEach((raw, k) => {
      const ln = raw.trim();
      if (!ln) return;
      let m;
      if ((m = ln.match(/^subgraph\s+([A-Za-z0-9_]+)/))) subgraphs.add(m[1]);
      // edge labels: -->|label|  or  -- label -->
      for (const e of ln.matchAll(/\|([^|]*)\|/g)) {
        const label = e[1].trim();
        if (label && !/^".*"$/.test(label) && /[^\w\s]/.test(label)) fail(`${where}: quote the edge label |${label}| → |"${label}"| (line ${k + 2})`);
        if (/[;#]/.test(label)) fail(`${where}: avoid ";" or "#" in edge label |${label}| (line ${k + 2})`);
      }
      if (/^subgraph\b/.test(ln)) return; // "subgraph ID[title]" is not a node
      // node shapes: id[..] id(..) id{..} id((..)) id([..]) id[[..]] id>..]
      // Mask the inside of quoted strings so brackets inside "labels" aren't read as shapes.
      const noEdgeLabels = ln.replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, (q) => '"' + 'x'.repeat(q.length - 2) + '"');
      const original = ln.replace(/\|[^|]*\|/g, '');
      for (const n of noEdgeLabels.matchAll(/(?:^|[\s&>-])([A-Za-z_][\w]*)\s*(\(\(|\(\[|\[\[|\[\(|\[\/|\[\\|\[|\(|\{\{|\{|>)/g)) {
        const id = n[1];
        if (['subgraph', 'direction', 'style', 'classDef', 'class', 'click', 'linkStyle'].includes(id)) continue;
        nodes.add(id);
        if (id === 'end') fail(`${where}: "end" can't be a node id (line ${k + 2})`);
        const start = n.index + n[0].length;
        const rest = noEdgeLabels.slice(start);
        const opener = n[2];
        if (rest.startsWith('"')) {
          const close = rest.indexOf('"', 1);
          const origRest = original.slice(start);
          const label = close > 0 ? origRest.slice(1, close) : origRest.slice(1);
          if (close < 0) fail(`${where}: unclosed quote in node ${id} (line ${k + 2})`);
          if (/[;#]/.test(label.replace(/&\w+;/g, ''))) fail(`${where}: avoid ";" or "#" in label of ${id}: "${label}" (line ${k + 2})`);
        } else {
          const closer = { '((': '))', '([': '])', '[[': ']]', '[(': ')]', '[/': '/]', '[\\': '\\]', '[': ']', '(': ')', '{{': '}}', '{': '}', '>': ']' }[opener];
          const end = rest.indexOf(closer);
          const label = end >= 0 ? rest.slice(0, end) : rest;
          if (/[^\w\s.,'\-+*/!?→←↑↓·…×÷≤≥≈✅❌⭐]/u.test(label.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''))) {
            fail(`${where}: quote the label of node ${id}: ${opener}${label}${closer} → ${opener}"${label}"${closer} (line ${k + 2})`);
          }
        }
      }
    });
    for (const s of subgraphs) if (nodes.has(s)) fail(`${where}: "${s}" is used as both a subgraph id and a node id`);
  } else {
    // sequence / state / class / er: message text after ":" must not contain ";" or "#"
    body.forEach((raw, k) => {
      const ln = raw.trim();
      if (!ln) return;
      if (type === 'sequenceDiagram' || type === 'stateDiagram-v2') {
        const idx = ln.indexOf(':');
        if (idx >= 0) {
          const text = ln.slice(idx + 1);
          if (/[;#]/.test(text.replace(/&\w+;/g, ''))) fail(`${where}: avoid ";" or "#" in "${text.trim().slice(0, 60)}" (line ${k + 2})`);
        }
      }
      if (type === 'sequenceDiagram' && /^(end)\b/.test(ln) === false && /\bend\b\s*:/.test(ln)) fail(`${where}: don't name a participant "end" (line ${k + 2})`);
    });
  }
}

// ---------------------------------------------------------------------------
// Chart (CSV) checks
function checkChart(csv, where, fail) {
  const rows = csv.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => r.split(',').map((c) => c.trim()));
  if (rows.length < 3) return fail(`${where}: chart needs a header row and at least 2 data rows`);
  const width = rows[0].length;
  if (width < 2) return fail(`${where}: chart header needs at least 2 columns (X label + 1 series)`);
  rows.slice(1).forEach((r, k) => {
    if (r.length !== width) fail(`${where}: chart row ${k + 2} has ${r.length} columns, header has ${width} (commas inside a label?)`);
    r.slice(1).forEach((c) => { if (c === '' || !Number.isFinite(Number(c))) fail(`${where}: chart value "${c}" in row ${k + 2} is not a number`); });
  });
}

// ---------------------------------------------------------------------------
// SVG checks: exists, well-formed XML, size, viewBox
function checkSvgXml(svg) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<|&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g;
  let m;
  while ((m = re.exec(svg))) {
    if (m[0].startsWith('<!--') || m[0].startsWith('<?') || m[0].startsWith('<![')) continue;
    if (m[0] === '<') return `stray "<" at offset ${m.index} (escape it as &lt; or fix the tag/attributes)`;
    if (m[0] === '&') return `unescaped "&" at offset ${m.index} (use &amp;)`;
    const [, closing, name, , selfClose] = m;
    if (selfClose) continue;
    if (closing) {
      const top = stack.pop();
      if (top !== name) return `</${name}> closes <${top || 'nothing'}>`;
    } else stack.push(name);
  }
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  return null;
}

function checkImage(urls, where, fail, warn, usedImages) {
  const list = urls.split('\n').map((u) => u.trim()).filter(Boolean);
  if (!list.length) return fail(`${where}: image block has no URL`);
  for (const u of list) {
    if (/^https?:\/\//.test(u)) continue;
    if (!u.startsWith('/images/')) { fail(`${where}: local images must live under /images/ (got ${u})`); continue; }
    const file = path.join(PUBLIC_DIR, u);
    usedImages.add(path.normalize(file));
    if (!fs.existsSync(file)) { fail(`${where}: image file not found: client/public${u}`); continue; }
    if (u.endsWith('.svg')) {
      const svg = fs.readFileSync(file, 'utf8');
      const err = checkSvgXml(svg);
      if (err) fail(`${where}: ${u} is not well-formed SVG: ${err}`);
      if (!/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) fail(`${where}: ${u} needs xmlns="http://www.w3.org/2000/svg" on <svg> (or it won't render in <img>)`);
      if (!/viewBox="0 0 800 400"/.test(svg)) warn(`${where}: ${u} should use viewBox="0 0 800 400"`);
      const size = Buffer.byteLength(svg);
      if (size > MAX_SVG_BYTES) warn(`${where}: ${u} is ${(size / 1024).toFixed(1)} KB (limit ~20 KB)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Code checks
const PLACEHOLDER = [
  /^\s*(\/\/|\/\*|#|\{\/\*)?\s*(\.\.\.|…)\s*(\*\/\}?|\*\/)?\s*$/m,
  /[{(\[]\s*(\.\.\.|…)\s*[})\]]/,
  /(\/\/|\/\*|#)[^\n]*\b(omitted|rest of (the )?(code|file|implementation)|same as above|and so on|TODO|FIXME|implement (this|me|later))\b/i,
];

let esbuild = null;
try { esbuild = require(process.env.ESBUILD_PATH || require.resolve('esbuild', { paths: [path.join(ROOT, 'client'), ROOT] })); } catch { /* optional */ }

function syntaxCheckJs(code, lang) {
  if (lang === 'javascript') {
    try { new vm.Script(`(async function () {\n${code}\n})`); return null; } catch (e) {
      if (!/^\s*(import|export)\s/m.test(code)) return e.message;
    }
    // ES module syntax: let Node check it as .mjs
    const tmp = path.join(os.tmpdir(), `verify-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(tmp, code);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    fs.unlinkSync(tmp);
    if (r.status === 0) return null;
    // ESM that also uses JSX-free top-level await etc. is fine; fall through to esbuild if available
    if (esbuild) {
      try { esbuild.transformSync(code, { loader: 'js', format: 'esm' }); return null; } catch (e) { return e.message.split('\n').slice(0, 3).join(' '); }
    }
    return (r.stderr || '').split('\n').filter((l) => /Error/.test(l))[0] || 'syntax error';
  }
  if (esbuild && ['jsx', 'tsx', 'typescript'].includes(lang)) {
    const loader = { jsx: 'jsx', tsx: 'tsx', typescript: 'ts' }[lang];
    try { esbuild.transformSync(code, { loader, format: 'esm' }); return null; } catch (e) { return e.message.split('\n').slice(0, 3).join(' '); }
  }
  if (lang === 'json') {
    try { JSON.parse(code); return null; } catch (e) { return e.message; }
  }
  return null;
}

// Runs plain JS like the browser Web Worker does (AsyncFunction, console capture) in a separate Node process.
const RUNNER = `
const out = [];
const fmt = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || String(v);
  if (typeof v === 'function') return v.toString();
  if (v instanceof Map) return 'Map(' + v.size + ') ' + safe(Object.fromEntries(v));
  if (v instanceof Set) return 'Set(' + v.size + ') ' + safe([...v]);
  return safe(v);
};
const safe = (v) => { try { const seen = new WeakSet(); return JSON.stringify(v, (k, val) => {
  if (typeof val === 'object' && val !== null) { if (seen.has(val)) return '[Circular]'; seen.add(val); }
  if (val instanceof Error) return val.name + ': ' + val.message;
  if (typeof val === 'bigint') return val.toString() + 'n';
  if (val === undefined) return 'undefined';
  return val; }); } catch (e) { return String(v); } };
const write = process.stdout.write.bind(process.stdout);
const send = (type, args) => write(JSON.stringify({ type, text: args.map(fmt).join(' ') }) + '\\n');
console.log = (...a) => send('log', a); console.info = console.log; console.table = console.log;
console.warn = (...a) => send('warn', a); console.error = (...a) => send('error', a);
process.on('unhandledRejection', (e) => send('error', ['Unhandled rejection: ', e]));
process.on('uncaughtException', (e) => send('error', [e]));
// Browser workers don't have these Node-only globals: hide them so examples behave like in the app.
for (const g of ['setImmediate', 'clearImmediate', 'Buffer', 'global']) { try { delete globalThis[g]; } catch {} }
let src = '';
process.stdin.on('data', (d) => (src += d));
process.stdin.on('end', async () => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('require', 'module', 'exports', '__filename', '__dirname', src)();
  } catch (err) { send('error', [err]); }
});
`;

function runCode(code) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', RUNNER], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, RUN_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', () => {
      clearTimeout(timer);
      const lines = stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { type: 'log', text: l }; } });
      if (stderr.trim()) lines.push({ type: 'error', text: stderr.trim() });
      resolve({ lines, timedOut });
    });
    child.stdin.end(code);
  });
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// ---------------------------------------------------------------------------
// Content standard (docs/content-format.md) → warnings
function standardWarnings(kind, q, warn) {
  const B = q.blocks;
  const has = (k, re) => B.some((b) => b.kind === k && (!re || re.test(b.header)));
  const count = (k) => B.filter((b) => b.kind === k).length;
  const textWith = (re) => B.find((b) => b.kind === 'text' && re.test(b.header));
  const need = (cond, msg) => { if (!cond) warn(msg); };
  const diagrams = B.filter((b) => b.kind === 'diagram');
  const visuals = diagrams.length + count('image') + count('chart');
  const meta = q.tags.includes('meta');

  need(diagrams.length >= 1, 'no Mermaid diagram');
  need(has('warning'), 'no ⚠️ warning (common mistakes) block');
  need(has('understand'), 'no understand block');
  need(has('ask'), 'no ask block');
  need(has('important'), 'no ⭐ important (interview answer) block');
  need(has('links'), 'no links block');
  need(q.quick.length >= 4, `only ${q.quick.length} @quick notes (need 4–6)`);

  if (kind === 'concept') {
    need(textWith(/simple words/i), 'no "🧒 In simple words" text block');
    need(textWith(/detailed answer/i), 'no "📖 Detailed answer" text block');
    need(textWith(/step by step/i), 'no "🪜 Step by step" text block');
    need(count('code') >= 1, 'no code example');
    need(visuals >= 2, `only ${visuals} visual(s): add a chart or SVG image next to the diagram`);
  }
  if (kind === 'dsa') {
    need(visuals >= 2, `only ${visuals} visual(s) (need diagram + image/chart)`);
    need(count('image') >= 1, 'no SVG image of the algorithm');
    if (!meta) {
      need(textWith(/problem/i), 'no "🧾 Problem" text block');
      need(textWith(/intuition/i), 'no "🧒 Intuition" text block');
      need(textWith(/brute/i), 'no "🐢 Brute force" text block');
      need(textWith(/key insight/i), 'no "💡 Key insight" text block');
      const dry = textWith(/dry run/i);
      need(dry && hasTable(dry.body), 'no "🔍 Dry run" text block with a table');
      const trade = textWith(/trade-?offs/i);
      need(trade && hasTable(trade.body), 'no "⚖️ Trade-offs" text block with a table');
      need(count('chart') >= 1, 'no brute-vs-optimal chart');
    }
  }
  if (kind === 'lld') {
    need(textWith(/simple words/i), 'no "🧒 In simple words" text block');
    need(textWith(/requirements/i), 'no "📋 Requirements" text block');
    need(textWith(/design/i), 'no "🧱 Design" text block');
    need(textWith(/folder/i), 'no "📁 Folder structure" text block');
    need(textWith(/how to run/i), 'no "🧪 How to run & test" text block');
    const trade = textWith(/trade-?offs/i);
    need(trade && hasTable(trade.body), 'no "⚖️ Trade-offs" text block with a table');
    need(textWith(/scaling/i), 'no "📈 Scaling & edge cases" text block');
    need(diagrams.length >= 2, `only ${diagrams.length} diagram(s): need architecture/class or component tree + sequence`);
    need(diagrams.some((d) => /^\s*sequenceDiagram/.test(d.body)), 'no sequence diagram of the main flow');
    const fileBlocks = B.filter((b) => b.kind === 'code' && /[\w-]+\/[\w./-]+\.\w+|^code\s+\w+\s+[\w.-]+\.(js|jsx|json|css|ts|tsx|yml|yaml)\b/.test(b.header));
    need(fileBlocks.length >= 4, `only ${fileBlocks.length} code block(s) titled with a file path (need every file in full)`);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md') && f.includes(filter)).sort();
  if (!process.env.CONTENT_DIR && fs.existsSync(TERMS_FILE) && 'terms.md'.includes(filter)) files.push('terms.md');
  if (!files.length) { console.log(`No content files match "${filter}"`); process.exit(1); }

  const globalFailures = [];
  // canRun() must stay identical in both places (docs/content-format.md, rule 6)
  const runJsSrc = fs.readFileSync(RUNJS_FILE, 'utf8');
  const m = runJsSrc.match(/export function canRun\([\s\S]*?\n\}/);
  if (!m || m[0].replace(/^export /, '') !== canRun.toString()) globalFailures.push('canRun() in scripts/verify-content.js differs from client/src/utils/runJs.js');

  let totalQ = 0, totalF = 0, totalW = 0, totalRun = 0;
  const usedImages = new Set();
  const report = [];

  for (const file of files) {
    const isTerms = file === 'terms.md';
    const text = isTerms ? `@section Terms\n${fs.readFileSync(TERMS_FILE, 'utf8')}` : fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const kind = isTerms ? 'terms' : kindOf(file);
    const failures = [];
    const warnings = [];
    let parsed;
    try { parsed = parseFile(text, file); } catch (e) { failures.push(`parse error: ${e.message}`); }
    const qs = rawBlocks(text);
    totalQ += qs.length;
    if (parsed && parsed.questions.length !== qs.length) failures.push(`parser found ${parsed.questions.length} questions, raw scan found ${qs.length}`);

    const runJobs = [];
    for (const q of qs) {
      const where = (b) => `"${q.title}"${b ? ` [${b.kind} @ line ${b.line}]` : ''}`;
      const fail = (msg) => failures.push(msg);
      const qWarn = [];
      q.quick.forEach((n) => checkProse(n, `${where()} @quick`, fail));
      let runnableWithCheck = false;
      for (const b of q.blocks) {
        const w = where(b);
        const kindTok = b.kind;
        if (['text', 'understand', 'ask', 'tip', 'warning', 'note', 'important'].includes(kindTok)) checkProse(b.body, w, fail);
        else if (kindTok === 'diagram') checkMermaid(b.body, w, fail);
        else if (kindTok === 'chart') checkChart(b.body, w, fail);
        else if (kindTok === 'image') checkImage(b.body, w, fail, (x) => qWarn.push(x), usedImages);
        else if (kindTok === 'code') {
          const parts = b.header.split(/\s+/);
          let lang = parts[1] || 'javascript';
          lang = { js: 'javascript', ts: 'typescript', shell: 'bash', dockerfile: 'docker' }[lang] || lang;
          if (!['javascript', 'typescript', 'jsx', 'tsx', 'bash', 'json', 'yaml', 'docker', 'nginx', 'sql', 'text', 'python', 'html', 'css'].includes(lang)) lang = 'javascript';
          if (/^\s*:::\s*$/m.test(b.body)) fail(`${w}: a line that is exactly ":::" inside code closes the block early`);
          if (PLACEHOLDER.some((re) => re.test(b.body))) qWarn.push(`${w}: placeholder in code ("...", "omitted", "TODO"…): write it in full`);
          const err = syntaxCheckJs(b.body, lang);
          if (err) fail(`${w}: ${lang} syntax error: ${err}`);
          if (canRun(b.body, lang) && !err) {
            if (/✅/.test(b.body) && /❌/.test(b.body)) runnableWithCheck = true;
            runJobs.push({ where: w, code: b.body, q });
          }
        } else if (kindTok === 'links') {
          b.body.split('\n').filter((l) => l.trim()).forEach((l) => { if (!/^[^|]+\|\s*https?:\/\/\S+\s*$/.test(l.trim())) fail(`${w}: link line must be "Label | https://url" → ${l.trim()}`); });
        }
      }
      if (kind !== 'terms') standardWarnings(kind, q, (x) => qWarn.push(x));
      if ((kind === 'dsa' && !q.tags.includes('meta')) || kind === 'lld') {
        if (!runnableWithCheck) qWarn.push('no browser-runnable example with ✅/❌ self-tests');
      }
      if (qWarn.length) warnings.push(...qWarn.map((x) => `${where()}: ${x.replace(`${where()}`, '').replace(/^: /, '')}`));
    }

    // Execute runnable examples (in parallel)
    const results = await pool(runJobs, Math.max(2, os.cpus().length - 1), (job) => runCode(job.code));
    totalRun += runJobs.length;
    results.forEach((r, i) => {
      const job = runJobs[i];
      const out = r.lines;
      if (SHOW) {
        console.log(`\n▶ ${file} ${job.where}`);
        out.forEach((l) => console.log(`   ${l.type === 'log' ? '' : `[${l.type}] `}${l.text}`));
      }
      if (r.timedOut) failures.push(`${job.where}: runnable example timed out after ${RUN_TIMEOUT_MS / 1000}s`);
      const errs = out.filter((l) => l.type === 'error');
      if (errs.length) failures.push(`${job.where}: runnable example error: ${errs[0].text.split('\n')[0].slice(0, 160)}`);
      const bad = out.find((l) => l.text.includes('❌'));
      if (bad) failures.push(`${job.where}: test failed → ${bad.text.slice(0, 160)}`);
      if (!out.length && !r.timedOut) warnings.push(`${job.where}: runnable example prints nothing`);
    });

    totalF += failures.length;
    totalW += warnings.length;
    report.push({ file, kind, questions: qs.length, failures, warnings, runs: runJobs.length });
  }

  // Images on disk that no question uses (only when checking everything)
  const orphans = [];
  if (!filter && fs.existsSync(path.join(PUBLIC_DIR, 'images'))) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(PUBLIC_DIR, 'images'))) if (!usedImages.has(path.normalize(f))) orphans.push(path.relative(ROOT, f));
  }

  for (const r of report) {
    const status = r.failures.length ? '❌' : r.warnings.length ? '⚠️ ' : '✅';
    console.log(`\n${status} ${r.file} (${r.kind}): ${r.questions} questions, ${r.runs} runnable examples, ${r.failures.length} failures, ${r.warnings.length} warnings`);
    r.failures.forEach((f) => console.log(`   ❌ FAIL ${f}`));
    if (process.env.QUIET_WARN) continue;
    r.warnings.forEach((w) => console.log(`   ⚠️  ${w}`));
  }
  globalFailures.forEach((f) => console.log(`\n❌ FAIL ${f}`));
  orphans.forEach((o) => console.log(`⚠️  unused image: ${o}`));
  totalF += globalFailures.length;
  if (!esbuild) console.log('\n(esbuild not found: JSX/TS blocks were not syntax-checked)');
  console.log(`\nSummary: ${report.length} files, ${totalQ} questions, ${totalRun} runnable examples executed, ${totalF} failures, ${totalW} warnings`);
  process.exit(totalF ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
