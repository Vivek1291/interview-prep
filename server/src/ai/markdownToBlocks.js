// Turns an AI answer (Markdown) into page blocks: text (HTML), code (highlighted) and Mermaid diagrams.
const crypto = require('crypto');
const { markdownToHtml } = require('../seed/markdown');

const LANG = { js: 'javascript', javascript: 'javascript', mjs: 'javascript', ts: 'typescript', typescript: 'typescript', jsx: 'jsx', tsx: 'tsx', sh: 'bash', shell: 'bash', bash: 'bash', zsh: 'bash', json: 'json', yaml: 'yaml', yml: 'yaml', dockerfile: 'docker', docker: 'docker', nginx: 'nginx', sql: 'sql', python: 'python', py: 'python', html: 'html', css: 'css' };

function normalizeMarkdown(text) {
  return text
    .replace(/^#{1}\s+/gm, '## ')                    // our renderer uses ## and ### for headings
    .replace(/^#{4,6}\s+/gm, '### ')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ');             // * and + bullets → -
}

function markdownToBlocks(md) {
  const blocks = [];
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let text = [];
  const flushText = () => {
    const t = text.join('\n').trim();
    if (t) blocks.push({ id: crypto.randomUUID(), type: 'text', title: '', content: markdownToHtml(normalizeMarkdown(t)) });
    text = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^\s*```\s*([\w+#.-]*)\s*$/.exec(lines[i]);
    if (!open) { text.push(lines[i]); continue; }
    const code = [];
    i += 1;
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
    flushText();
    const lang = open[1].toLowerCase();
    const body = code.join('\n').replace(/\s+$/, '');
    if (!body) continue;
    if (lang === 'mermaid') blocks.push({ id: crypto.randomUUID(), type: 'diagram', title: '🗺️ Diagram', content: body });
    else blocks.push({ id: crypto.randomUUID(), type: 'code', title: '', lang: LANG[lang] || (lang ? 'text' : 'javascript'), content: body });
  }
  flushText();
  return blocks;
}

module.exports = { markdownToBlocks };
