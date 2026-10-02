// Reads a .docx (Word / Google Docs export) into a flat list of simple elements:
//   { t: 'h',     level, text, html }      heading (level 1-6)
//   { t: 'p',     text, html, list? }      paragraph; list = { ordered, level }
//   { t: 'code',  text }                   a line of code (monospace paragraph)
//   { t: 'table', html, text }
//   { t: 'img',   media, alt }             media = path inside the zip, e.g. "word/media/image1.png"
// All HTML is BUILT here from escaped text, so nothing from the file is passed through as markup.
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const ApiError = require('../utils/ApiError');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAX_XML = 120 * 1024 * 1024; // refuse absurdly large (zip-bomb) documents

const MONO = /mono|courier|consolas|menlo|monaco|inconsolata|source code|code|fixedsys|lucida console/i;
// Word highlight names → colours
const HIGHLIGHT = {
  yellow: '#fef08a', green: '#bbf7d0', cyan: '#a5f3fc', magenta: '#f5d0fe', blue: '#bfdbfe', red: '#fecaca',
  darkBlue: '#bfdbfe', darkCyan: '#a5f3fc', darkGreen: '#bbf7d0', darkMagenta: '#f5d0fe', darkRed: '#fecaca',
  darkYellow: '#fde68a', lightGray: '#e5e7eb', darkGray: '#d1d5db',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (v) => (/^[0-9a-f]{6}$/i.test(v || '') ? `#${v.toLowerCase()}` : null);
const kids = (el, name) => {
  const out = [];
  for (let n = el?.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || n.localName === name)) out.push(n);
  return out;
};
const kid = (el, name) => kids(el, name)[0] || null;
const attr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute(`w:${name}`) || '' : '');
const isOn = (el) => !!el && !['0', 'false', 'none'].includes(attr(el, 'val'));
// Near-black text and near-white backgrounds are "no colour" (Google Docs writes #0a0a0a, #202124… everywhere)
function isPlain(c) {
  if (!c) return true;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.2 || lum > 0.94;
}

async function readZipText(zip, name) {
  const f = zip.file(name);
  if (!f) return null;
  // eslint-disable-next-line no-underscore-dangle
  if ((f._data?.uncompressedSize || 0) > MAX_XML) throw ApiError.badRequest('This document is too large to import');
  return f.async('string');
}

const parseXml = (text) => new DOMParser({ onError: () => {} }).parseFromString(text, 'text/xml');

/** Relationship id → target (images, links). */
function readRels(doc) {
  const map = new Map();
  if (!doc) return map;
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
    map.set(r.getAttribute('Id'), { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' });
  }
  return map;
}

/** styleId → { name, headingLevel, mono, bold } */
function readStyles(doc) {
  const map = new Map();
  if (!doc) return map;
  for (const s of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    const id = attr(s, 'styleId');
    const name = attr(kid(s, 'name'), 'val');
    const ppr = kid(s, 'pPr');
    const rpr = kid(s, 'rPr');
    let level = 0;
    const m = /^heading\s*(\d)$/i.exec(name);
    if (m) level = Number(m[1]);
    else if (/^title$/i.test(name)) level = 1;
    else if (kid(ppr, 'outlineLvl')) level = Number(attr(kid(ppr, 'outlineLvl'), 'val')) + 1;
    const fonts = kid(rpr, 'rFonts');
    map.set(id, {
      name,
      headingLevel: level >= 1 && level <= 6 ? level : 0,
      mono: /code|source|preformatted|monospace/i.test(name) || MONO.test(attr(fonts, 'ascii') || attr(fonts, 'hAnsi')),
    });
  }
  return map;
}

/** numId → level → ordered? */
function readNumbering(doc) {
  const abstract = new Map();
  const nums = new Map();
  if (!doc) return nums;
  for (const a of Array.from(doc.getElementsByTagNameNS(W, 'abstractNum'))) {
    const levels = new Map();
    for (const lvl of kids(a, 'lvl')) levels.set(Number(attr(lvl, 'ilvl')), attr(kid(lvl, 'numFmt'), 'val') !== 'bullet');
    abstract.set(attr(a, 'abstractNumId'), levels);
  }
  for (const n of Array.from(doc.getElementsByTagNameNS(W, 'num'))) {
    nums.set(attr(n, 'numId'), abstract.get(attr(kid(n, 'abstractNumId'), 'val')) || new Map());
  }
  return nums;
}

function createReader({ styles, rels, numbering }) {
  const out = [];

  /** Formatting of one run → { bold, italic, ..., mono } */
  function runFormat(r) {
    const rpr = kid(r, 'rPr');
    const st = styles.get(attr(kid(rpr, 'rStyle'), 'val'));
    const fonts = kid(rpr, 'rFonts');
    const shd = hex(attr(kid(rpr, 'shd'), 'fill'));
    const hl = HIGHLIGHT[attr(kid(rpr, 'highlight'), 'val')];
    const color = hex(attr(kid(rpr, 'color'), 'val'));
    const va = attr(kid(rpr, 'vertAlign'), 'val');
    return {
      b: isOn(kid(rpr, 'b')),
      i: isOn(kid(rpr, 'i')),
      u: !!kid(rpr, 'u') && attr(kid(rpr, 'u'), 'val') !== 'none',
      s: isOn(kid(rpr, 'strike')) || isOn(kid(rpr, 'dstrike')),
      mark: hl || (shd && !isPlain(shd) ? shd : null),
      color: isPlain(color) ? null : color,
      sub: va === 'subscript',
      sup: va === 'superscript',
      mono: !!st?.mono || MONO.test(attr(fonts, 'ascii') || attr(fonts, 'hAnsi') || attr(fonts, 'cs')),
    };
  }

  /** Text pieces of a paragraph: [{ text, f, href }] plus images found in it. */
  function collectRuns(p, href = null, acc = { runs: [], images: [] }) {
    for (const n of kids(p)) {
      const name = n.localName;
      if (name === 'r') {
        const f = runFormat(n);
        let text = '';
        for (const c of kids(n)) {
          if (c.localName === 't') text += c.textContent;
          else if (c.localName === 'tab') text += '\t';
          else if (c.localName === 'br' && attr(c, 'type') !== 'page') text += '\n';
          else if (c.localName === 'noBreakHyphen') text += '-';
          else if (c.localName === 'drawing' || c.localName === 'pict' || c.localName === 'object') {
            for (const blip of [...Array.from(c.getElementsByTagNameNS('*', 'blip')), ...Array.from(c.getElementsByTagNameNS('*', 'imagedata'))]) {
              const id = blip.getAttributeNS(R, 'embed') || blip.getAttributeNS(R, 'id') || blip.getAttribute('r:embed') || blip.getAttribute('r:id');
              const rel = rels.get(id);
              if (rel && !rel.external) {
                const descr = Array.from(c.getElementsByTagNameNS('*', 'docPr'))[0]?.getAttribute('descr') || '';
                acc.images.push({ media: `word/${rel.target.replace(/^\/?word\//, '').replace(/^\.\//, '')}`, alt: descr });
              }
            }
          }
        }
        if (text) acc.runs.push({ text, f, href });
      } else if (name === 'hyperlink') {
        const rel = rels.get(n.getAttributeNS(R, 'id') || n.getAttribute('r:id'));
        const url = rel?.external && /^(https?:|mailto:)/i.test(rel.target) ? rel.target : null;
        collectRuns(n, url, acc);
      } else if (['smartTag', 'ins', 'fldSimple', 'customXml', 'sdt', 'sdtContent', 'bdo', 'dir'].includes(name)) {
        collectRuns(name === 'sdt' ? kid(n, 'sdtContent') || n : n, href, acc);
      }
      // deleted text (w:del), field instructions (w:instrText) etc. are skipped
    }
    return acc;
  }

  function runsToHtml(runs, { inCode = false } = {}) {
    let html = '';
    for (const { text, f, href } of runs) {
      let h = esc(text).replace(/\n/g, '<br>').replace(/\t/g, ' &nbsp; ');
      if (f.mono && !inCode) h = `<code>${h}</code>`;
      if (f.sub) h = `<sub>${h}</sub>`;
      if (f.sup) h = `<sup>${h}</sup>`;
      if (f.s) h = `<s>${h}</s>`;
      if (f.u && !href) h = `<u>${h}</u>`;
      if (f.i) h = `<em>${h}</em>`;
      if (f.b) h = `<strong>${h}</strong>`;
      if (f.color) h = `<span style="color: ${f.color}">${h}</span>`;
      if (f.mark) h = `<mark data-color="${f.mark}" style="background-color: ${f.mark}; color: inherit">${h}</mark>`;
      if (href) h = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${h}</a>`;
      html += h;
    }
    // merge "</strong><strong>" etc. left by adjacent runs with the same format
    return html.replace(/<\/(strong|em|u|s|code)><\1>/g, '');
  }

  function paragraph(p) {
    const ppr = kid(p, 'pPr');
    const style = styles.get(attr(kid(ppr, 'pStyle'), 'val'));
    const { runs, images } = collectRuns(p);
    const text = runs.map((r) => r.text).join('');
    const visible = text.replace(/\s+/g, '');
    let level = style?.headingLevel || 0;
    if (kid(ppr, 'outlineLvl')) {
      const l = Number(attr(kid(ppr, 'outlineLvl'), 'val')) + 1;
      if (l >= 1 && l <= 6) level = l;
    }
    const allMono = visible && runs.filter((r) => r.text.trim()).every((r) => r.f.mono);

    if (level && visible) {
      out.push({ t: 'h', level, text: text.trim(), html: runsToHtml(runs.map((r) => ({ ...r, f: { ...r.f, b: false } }))).trim() });
    } else if (style?.mono || allMono) {
      out.push({ t: 'code', text });
    } else if (visible) {
      const numPr = kid(ppr, 'numPr');
      const numId = attr(kid(numPr, 'numId'), 'val');
      let list;
      if (numPr && numId && numId !== '0') {
        const ilvl = Number(attr(kid(numPr, 'ilvl'), 'val') || 0);
        list = { ordered: numbering.get(numId)?.get(ilvl) ?? false, level: Math.min(ilvl, 3) };
      }
      out.push({ t: 'p', text, html: runsToHtml(runs), ...(list ? { list } : {}) });
    } else if (!images.length) {
      out.push({ t: 'blank' });
    }
    for (const img of images) out.push({ t: 'img', ...img });
  }

  function cellContent(tc, images) {
    const parts = [];
    for (const n of kids(tc)) {
      if (n.localName === 'p') {
        const r = collectRuns(n);
        images.push(...r.images);
        if (r.runs.length) parts.push(`<p>${runsToHtml(r.runs)}</p>`);
      } else if (n.localName === 'tbl') {
        // nested table: flatten its text
        for (const p of Array.from(n.getElementsByTagNameNS(W, 'p'))) {
          const r = collectRuns(p);
          images.push(...r.images);
          if (r.runs.length) parts.push(`<p>${runsToHtml(r.runs)}</p>`);
        }
      }
    }
    return parts.join('') || '<p></p>';
  }

  function table(tbl) {
    const rows = kids(tbl, 'tr');
    const cells = rows.flatMap((tr) => kids(tr, 'tc'));
    // A one-cell table where everything is monospace is a "code box" (common in Google Docs)
    if (cells.length === 1) {
      const paras = kids(cells[0], 'p');
      const lines = paras.map((p) => collectRuns(p));
      const textRuns = lines.flatMap((l) => l.runs).filter((r) => r.text.trim());
      if (textRuns.length && textRuns.every((r) => r.f.mono)) {
        for (const l of lines) out.push({ t: 'code', text: l.runs.map((r) => r.text).join('') });
        return;
      }
    }
    const images = [];
    const body = rows.map((tr, i) => {
      const tag = i === 0 && rows.length > 1 ? 'th' : 'td';
      return `<tr>${kids(tr, 'tc').map((tc) => {
        const span = Number(attr(kid(kid(tc, 'tcPr'), 'gridSpan'), 'val') || 1);
        return `<${tag}${span > 1 ? ` colspan="${span}"` : ''}>${cellContent(tc, images)}</${tag}>`;
      }).join('')}</tr>`;
    }).join('');
    out.push({ t: 'table', html: `<table><tbody>${body}</tbody></table>`, text: tbl.textContent || '' });
    for (const img of images) out.push({ t: 'img', ...img });
  }

  function walk(container) {
    for (const n of kids(container)) {
      if (n.localName === 'p') paragraph(n);
      else if (n.localName === 'tbl') table(n);
      else if (n.localName === 'sdt') walk(kid(n, 'sdtContent') || n);
      else if (n.localName === 'customXml') walk(n);
    }
  }

  return { walk, out };
}

/**
 * @param {Buffer} buffer the .docx file
 * @returns {{ elements, zip }} zip is kept so images can be extracted when the import is saved
 */
async function readDocx(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw ApiError.badRequest('This is not a valid .docx file');
  }
  const xml = await readZipText(zip, 'word/document.xml');
  if (!xml) throw ApiError.badRequest('This is not a Word document (word/document.xml is missing)');
  const [stylesXml, relsXml, numberingXml] = await Promise.all([
    readZipText(zip, 'word/styles.xml'),
    readZipText(zip, 'word/_rels/document.xml.rels'),
    readZipText(zip, 'word/numbering.xml'),
  ]);
  const reader = createReader({
    styles: readStyles(stylesXml && parseXml(stylesXml)),
    rels: readRels(relsXml && parseXml(relsXml)),
    numbering: readNumbering(numberingXml && parseXml(numberingXml)),
  });
  const body = parseXml(xml).getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw ApiError.badRequest('The document is empty');
  reader.walk(body);
  return { elements: reader.out, zip };
}

module.exports = { readDocx, esc };
