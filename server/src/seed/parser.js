// Parses the seed content files (seed/content/*.md) into Section + Question documents.
//
// File format:
//   @section Title            @icon 🟢     @color #22c55e     @desc Some description
//   === Question title
//   @p 3                       (priority 1-3)
//   @tags a, b
//   @quick                     (quick-revise notes, one "- " line each, until blank line)
//   - note one
//   ::: <type> [lang|chartType] [Optional custom title]
//   ...raw content...
//   :::
const crypto = require('crypto');
const { markdownToHtml, inline } = require('./markdown');

const PRESETS = {
  text: { title: '📖 Answer', color: '' },
  understand: { title: '🧠 What you must understand', color: '#8b5cf6' },
  ask: { title: '❓ Ask the interviewer / Be cautious', color: '#f97316' },
  tip: { title: '💡 Tip', color: '#10b981' },
  warning: { title: '⚠️ Common mistakes', color: '#ef4444' },
  note: { title: '📝 Note', color: '#eab308' },
  important: { title: '⭐ Say this in the interview', color: '#ec4899' },
  code: { title: '💻 Code', color: '#0ea5e9' },
  diagram: { title: '🗺️ Diagram', color: '#14b8a6' },
  chart: { title: '📊 Chart', color: '#6366f1' },
  links: { title: '🔗 Learn more', color: '#64748b' },
  image: { title: '🖼️ Image', color: '#64748b' },
};
const CALLOUTS = ['understand', 'ask', 'tip', 'warning', 'note', 'important'];
const LANGS = ['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx', 'bash', 'shell', 'json', 'yaml', 'docker', 'dockerfile', 'nginx', 'sql', 'text', 'python', 'html', 'css'];
const CHARTS = ['bar', 'line', 'area'];

function makeBlock(header, body) {
  const parts = header.trim().split(/\s+/);
  const kind = parts.shift();
  let lang = '';
  let chartType = '';
  if (kind === 'code' && parts[0] && LANGS.includes(parts[0])) lang = parts.shift();
  if (kind === 'chart' && parts[0] && CHARTS.includes(parts[0])) chartType = parts.shift();
  const preset = PRESETS[kind];
  if (!preset) throw new Error(`Unknown block type "${kind}"`);
  const title = parts.join(' ') || preset.title;
  const block = { id: crypto.randomUUID(), title, color: preset.color, content: '', variant: '', lang: '', chartType: '' };

  const trimmed = body.replace(/^\n+|\s+$/g, '');
  if (kind === 'text') Object.assign(block, { type: 'text', content: markdownToHtml(trimmed) });
  else if (CALLOUTS.includes(kind)) Object.assign(block, { type: 'callout', variant: kind, content: markdownToHtml(trimmed) });
  else if (kind === 'code') Object.assign(block, { type: 'code', lang: normaliseLang(lang || 'javascript'), content: trimmed });
  else if (kind === 'diagram') Object.assign(block, { type: 'diagram', content: trimmed });
  else if (kind === 'chart') Object.assign(block, { type: 'chart', chartType: chartType || 'bar', content: trimmed });
  else if (kind === 'links') Object.assign(block, { type: 'links', content: trimmed });
  else if (kind === 'image') Object.assign(block, { type: 'image', content: trimmed });
  return block;
}

function normaliseLang(l) {
  return { js: 'javascript', ts: 'typescript', shell: 'bash', dockerfile: 'docker' }[l] || l;
}

function parseFile(text, fileName = '') {
  const lines = text.replace(/\r/g, '').split('\n');
  const section = { title: '', icon: '📘', color: '#6366f1', description: '' };
  const questions = [];
  let q = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^@section\s+(.*)$/))) section.title = m[1].trim();
    else if ((m = line.match(/^@icon\s+(.*)$/))) section.icon = m[1].trim();
    else if ((m = line.match(/^@color\s+(.*)$/))) section.color = m[1].trim();
    else if ((m = line.match(/^@desc\s+(.*)$/))) section.description = m[1].trim();
    else if ((m = line.match(/^===\s+(.*)$/))) {
      q = { title: m[1].trim(), priority: 2, tags: [], blocks: [], quickNotes: [] };
      questions.push(q);
    } else if (q && (m = line.match(/^@p\s+(\d)/))) q.priority = Number(m[1]);
    else if (q && (m = line.match(/^@tags\s+(.*)$/))) q.tags = m[1].split(',').map((t) => t.trim()).filter(Boolean);
    else if (q && line.startsWith('@quick')) {
      i++;
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        q.quickNotes.push({ id: crypto.randomUUID(), text: inline(lines[i].trim().slice(2)), color: '#fde68a' });
        i++;
      }
      continue;
    } else if (q && (m = line.match(/^:::\s*(\S.*)$/))) {
      const header = m[1];
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') body.push(lines[i++]);
      if (i >= lines.length) throw new Error(`${fileName}: unclosed block "${header}" in "${q.title}"`);
      q.blocks.push(makeBlock(header, body.join('\n')));
    }
    i++;
  }
  if (!section.title) throw new Error(`${fileName}: missing @section`);
  return { section, questions };
}

module.exports = { parseFile, PRESETS };
