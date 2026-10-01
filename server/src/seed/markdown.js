// Tiny markdown → HTML converter used only for seed content (no dependencies).
// Supports: ### headings, paragraphs, - lists (1 nesting level), 1. lists, > quotes, | tables |,
// inline `code`, **bold**, *italic*, ==highlight==, ==[#color]highlight==, {color:#hex}text{/color}, [link](url)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(raw) {
  const codes = [];
  let s = raw.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/==\[(#[0-9a-fA-F]{3,8})\]([^=]+)==/g, '<mark data-color="$1" style="background-color: $1; color: inherit">$2</mark>')
    .replace(/==([^=]+)==/g, '<mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">$1</mark>')
    .replace(/\{color:(#[0-9a-fA-F]{3,8})\}(.+?)\{\/color\}/g, '<span style="color: $1">$2</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

function renderList(lines, ordered) {
  // lines: [{indent, text}]
  const tag = ordered ? 'ol' : 'ul';
  let html = `<${tag}>`;
  let i = 0;
  while (i < lines.length) {
    const { text } = lines[i];
    let li = `<li><p>${inline(text)}</p>`;
    const children = [];
    i++;
    while (i < lines.length && lines[i].indent > 0) children.push({ indent: 0, text: lines[i].text, ordered: lines[i].ordered }), i++;
    if (children.length) li += renderList(children, children[0].ordered);
    html += li + '</li>';
  }
  return html + `</${tag}>`;
}

function renderTable(rows) {
  // split on | but NOT inside `code spans`
  const cells = (r) => {
    const s = r.trim().replace(/^\|/, '').replace(/\|$/, '');
    const out = [];
    let cur = '', inCode = false;
    for (const ch of s) {
      if (ch === '`') inCode = !inCode;
      if (ch === '|' && !inCode) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const [head, , ...body] = rows;
  let html = '<table><tbody><tr>' + cells(head).map((c) => `<th><p>${inline(c)}</p></th>`).join('') + '</tr>';
  for (const r of body) html += '<tr>' + cells(r).map((c) => `<td><p>${inline(c)}</p></td>`).join('') + '</tr>';
  return html + '</tbody></table>';
}

function markdownToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  let out = '';
  let i = 0;
  const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m;
    if ((m = line.match(/^(#{2,4})\s+(.*)$/))) {
      const level = Math.min(m[1].length + 1, 4); // ## → h3, ### → h4
      out += `<h${level}>${inline(m[2])}</h${level}>`;
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      out += renderTable(rows);
      continue;
    }
    if (line.startsWith('>')) {
      const q = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      out += `<blockquote><p>${inline(q.join(' '))}</p></blockquote>`;
      continue;
    }
    if ((m = line.match(listRe)) && m[1].length === 0) {
      const ordered = /\d+\./.test(m[2]);
      const items = [];
      while (i < lines.length && (m = lines[i].match(listRe))) {
        items.push({ indent: m[1].length, text: m[3], ordered: /\d+\./.test(m[2]) });
        i++;
      }
      out += renderList(items, ordered);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !listRe.test(lines[i]) && !lines[i].trim().startsWith('|') && !/^#{2,4}\s/.test(lines[i]) && !lines[i].startsWith('>')) {
      para.push(lines[i++].trim());
    }
    out += `<p>${para.map(inline).join('<br>')}</p>`;
  }
  return out;
}

module.exports = { markdownToHtml, inline };
