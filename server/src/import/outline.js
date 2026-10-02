// Turns the flat element list of a document into categories + pages, and pages into blocks.
//
// Split rules (chosen by the user, with a preview):
//   { type: 'heading', level: N }  headings above N → (sub-)categories, heading N → a page, deeper → inside the page
//   { type: 'prefix', prefix: 'Q)' } every paragraph/heading starting with the prefix starts a page
//   { type: 'single' }               the whole document is one page
const crypto = require('crypto');
const { esc } = require('./docxReader');

const TITLE_MAX = 200;
const CATEGORY_TITLE_MAX = 120;
const PREFIXES = ['Q)', 'Q.', 'Q:', 'Q -', 'Question:', 'Question'];

const normal = (s) => s.replace(/\s+/g, ' ').trim();
const startsWithPrefix = (text, prefix) => normal(text).toLowerCase().startsWith(prefix.toLowerCase());
const isTitleCandidate = (e) => e.t === 'h' || e.t === 'p';

function clip(title, max) {
  const t = normal(title);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Which split rules make sense for this document (with how many pages each would create). */
function analyse(elements, fileName) {
  const headingCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const e of elements) if (e.t === 'h') headingCounts[e.level] += 1;

  const rules = [];
  for (const prefix of PREFIXES) {
    const n = elements.filter((e) => isTitleCandidate(e) && startsWithPrefix(e.text, prefix)).length;
    // "Question" also matches "Question:" → only offer the most specific one with the same count
    if (n >= 2 && !rules.some((r) => r.type === 'prefix' && r.count === n)) {
      rules.push({ type: 'prefix', prefix, count: n, label: `Each line starting with “${prefix}” is a page` });
    }
  }
  for (let level = 1; level <= 6; level += 1) {
    if (!headingCounts[level]) continue;
    const above = headingCounts.slice(1, level).reduce((a, b) => a + b, 0);
    rules.push({
      type: 'heading', level, count: headingCounts[level],
      label: `Each Heading ${level} is a page${above ? `, Heading ${level > 2 ? `1–${level - 1}` : 1} become sub-categories` : ''}`,
    });
  }
  rules.push({ type: 'single', count: 1, label: 'The whole document is one page' });

  // Suggest: a question prefix if the document has several; otherwise the heading level that gives
  // a sensible number of pages (not 1, not hundreds of fragments).
  const prefix = rules.find((r) => r.type === 'prefix' && r.count >= 3);
  const heading = rules.filter((r) => r.type === 'heading' && r.count >= 2)
    .sort((a, b) => Math.abs(Math.log(a.count / 25)) - Math.abs(Math.log(b.count / 25)))[0];
  const suggested = prefix || heading || rules[rules.length - 1];

  const count = (t) => elements.filter((e) => e.t === t).length;
  return {
    fileName,
    stats: { paragraphs: count('p'), headings: count('h'), codeLines: count('code'), tables: count('table'), images: count('img') },
    rules: rules.map(({ type, level, prefix: p, count: c, label }) => ({ type, ...(level ? { level } : {}), ...(p ? { prefix: p } : {}), count: c, label })),
    suggested: { type: suggested.type, ...(suggested.level ? { level: suggested.level } : {}), ...(suggested.prefix ? { prefix: suggested.prefix } : {}) },
  };
}

/**
 * Outline for a rule: [{ key, type: 'category'|'page', depth, title, start, end, titleElement, stats }]
 * Pages own the elements [start, end). `titleElement` (index) is the line that became the title.
 */
function outline(elements, rule, fileName = 'Imported document') {
  const items = [];
  let page = null;
  const close = (end) => { if (page) { page.end = end; items.push(page); page = null; } };
  const openPage = (start, title, depth, titleElement = null) => {
    page = { key: `p${start}`, type: 'page', depth, title, start, end: start, titleElement };
  };

  if (rule.type === 'single') {
    openPage(0, clip(fileName, TITLE_MAX), 0);
    close(elements.length);
  } else if (rule.type === 'prefix') {
    const prefix = rule.prefix;
    elements.forEach((e, i) => {
      if (isTitleCandidate(e) && startsWithPrefix(e.text, prefix)) {
        close(i);
        const title = normal(e.text).slice(prefix.length).replace(/^[\s:.)\-–—]+/, '');
        openPage(i, clip(title || 'Untitled question', TITLE_MAX), 0, i);
      } else if (!page && e.t !== 'blank') {
        openPage(i, 'Introduction', 0);
      }
    });
    close(elements.length);
  } else {
    const level = rule.level;
    const stack = []; // levels of the open categories
    elements.forEach((e, i) => {
      if (e.t === 'h' && e.level < level) {
        close(i);
        while (stack.length && stack[stack.length - 1] >= e.level) stack.pop();
        items.push({ key: `c${i}`, type: 'category', depth: stack.length, title: clip(e.text, CATEGORY_TITLE_MAX), start: i, end: i + 1, titleElement: i });
        stack.push(e.level);
      } else if (e.t === 'h' && e.level === level) {
        close(i);
        openPage(i, clip(e.text, TITLE_MAX), stack.length, i);
      } else if (!page && e.t !== 'blank') {
        // text right under a category (or before the first heading) → an "Overview" page
        openPage(i, stack.length ? 'Overview' : 'Introduction', stack.length);
      }
    });
    close(elements.length);
  }

  for (const it of items) {
    if (it.type !== 'page') continue;
    const els = elements.slice(it.start, it.end);
    it.stats = {
      paragraphs: els.filter((e) => e.t === 'p').length,
      codeLines: els.filter((e) => e.t === 'code').length,
      images: els.filter((e) => e.t === 'img').length,
      tables: els.filter((e) => e.t === 'table').length,
    };
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// Page → blocks

const STRAIGHT = { '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'", ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ' };

function guessLang(code) {
  if (/^\s*(\$ |npm |npx |yarn |pnpm |git |docker |curl |cd |ls |mkdir |sudo |brew |node )/m.test(code)) return 'bash';
  if (/\b(SELECT|INSERT INTO|CREATE TABLE|UPDATE \w+ SET|DELETE FROM)\b/.test(code)) return 'sql';
  if (/^\s*<(!doctype|html|head|body|div|script|link|meta|style)\b/im.test(code) && !/\b(const|let|function|=>|import)\b/.test(code)) return 'html';
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(code)) { try { JSON.parse(code); return 'json'; } catch { /* not json */ } }
  if (/(<[A-Z]\w*[\s/>]|return\s*\(\s*<|className=)/.test(code)) return /:\s*(string|number|React\.\w+)\b|interface\s+\w+/.test(code) ? 'tsx' : 'jsx';
  if (/\binterface\s+\w+\s*{|:\s*(string|number|boolean|void|any)\b[,;)=\s]|\btype\s+\w+\s*=/.test(code)) return 'typescript';
  if (/^[\s]*[.#]?[a-z][\w-]*(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^}]*:[^}]*;/im.test(code) && !/\b(function|const|let|=>)\b/.test(code)) return 'css';
  return 'javascript';
}

/** HTML for a run of list paragraphs, nested by level (Tiptap's <ul><li><p>…</p><ul>…</ul></li></ul> shape). */
function listHtml(items) {
  let html = '';
  const stack = []; // open list tags
  for (const it of items) {
    const tag = it.list.ordered ? 'ol' : 'ul';
    const lvl = it.list.level;
    while (stack.length > lvl + 1) html += `</li></${stack.pop()}>`;
    if (stack.length === lvl + 1) {
      if (stack[stack.length - 1] !== tag) { html += `</li></${stack.pop()}><${tag}>`; stack.push(tag); } else html += '</li>';
    } else {
      while (stack.length < lvl + 1) { html += `<${tag}>`; stack.push(tag); if (stack.length < lvl + 1) html += '<li>'; }
    }
    html += `<li><p>${it.html}</p>`;
  }
  while (stack.length) html += `</li></${stack.pop()}>`;
  return html;
}

/**
 * Blocks for one page. `imageUrl(media)` returns the saved URL of an image (or null if unsupported).
 * The title line itself is not repeated in the content (unless it was cut short).
 */
async function pageBlocks(elements, item, { imageUrl, mergedFrom = [] }) {
  const parts = [{ start: item.start, end: item.end, titleElement: item.titleElement, fullTitle: null }, ...mergedFrom];
  const blocks = [];
  let html = '';
  let list = [];
  let code = [];
  let images = [];

  const flushList = () => { if (list.length) { html += listHtml(list); list = []; } };
  const flushText = () => {
    flushList();
    if (html.trim()) blocks.push({ id: crypto.randomUUID(), type: 'text', title: '', content: html });
    html = '';
  };
  const flushCode = () => {
    while (code.length && !code[code.length - 1].trim()) code.pop();
    if (code.length) {
      const text = code.join('\n').replace(/[“”„‘’‚    ]/g, (c) => STRAIGHT[c]);
      blocks.push({ id: crypto.randomUUID(), type: 'code', title: '', lang: guessLang(text), content: text });
    }
    code = [];
  };
  const flushImages = () => {
    if (images.length) blocks.push({ id: crypto.randomUUID(), type: 'image', title: images[0].alt || '', content: images.map((i) => i.url).join('\n') });
    images = [];
  };

  // inner heading levels → h2/h3/h4 by rank
  const innerLevels = [...new Set(parts.flatMap((p) => elements.slice(p.start, p.end).filter((e, k) => e.t === 'h' && p.start + k !== p.titleElement).map((e) => e.level)))].sort();
  const hTag = (level) => `h${Math.min(2 + Math.max(0, innerLevels.indexOf(level)), 4)}`;

  for (const [n, part] of parts.entries()) {
    if (n > 0 && part.titleElement != null) {
      // a merged page: keep its title as a heading so nothing is lost
      flushCode(); flushImages(); flushList();
      html += `<h2>${esc(part.title || normal(elements[part.titleElement].text))}</h2>`;
    }
    for (let i = part.start; i < part.end; i += 1) {
      const e = elements[i];
      if (i === part.titleElement) {
        // title too long for the sidebar? keep the full question as the first line
        if (n === 0 && normal(e.text).length > TITLE_MAX) html += `<p><strong>${esc(normal(e.text))}</strong></p>`;
        continue;
      }
      if (e.t === 'code') {
        if (!code.length) { flushImages(); flushText(); }
        code.push(e.text);
        continue;
      }
      if (e.t === 'blank') {
        if (code.length) code.push('');               // blank line inside a code block
        continue;
      }
      flushCode();
      if (e.t === 'img') {
        const url = await imageUrl(e.media);
        if (url) { if (!images.length) flushText(); images.push({ url, alt: e.alt }); } else html += '<p><em>(An image in an unsupported format was skipped.)</em></p>';
        continue;
      }
      flushImages();
      if (e.t === 'p' && e.list) { list.push(e); continue; }
      flushList();
      if (e.t === 'h') html += `<${hTag(e.level)}>${e.html || esc(e.text)}</${hTag(e.level)}>`;
      else if (e.t === 'p') html += `<p>${e.html}</p>`;
      else if (e.t === 'table') html += e.html;
    }
  }
  flushCode();
  flushImages();
  flushText();
  if (!blocks.length) blocks.push({ id: crypto.randomUUID(), type: 'text', title: '', content: '<p></p>' });
  return blocks;
}

/** Split very large pages so a single page stays well under MongoDB's 16 MB document limit. */
function chunkBlocks(blocks, maxBytes = 6 * 1024 * 1024) {
  const chunks = [[]];
  let size = 0;
  for (const b of blocks) {
    const s = Buffer.byteLength(b.content || '');
    if (size + s > maxBytes && chunks[chunks.length - 1].length) { chunks.push([]); size = 0; }
    chunks[chunks.length - 1].push(b);
    size += s;
  }
  return chunks;
}

module.exports = { analyse, outline, pageBlocks, chunkBlocks, guessLang, listHtml, PREFIXES };
