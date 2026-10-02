// Talking to Google Docs for imports. Only Google hosts are ever contacted.
//   docIdFrom(url)          → the document id from a Google Docs link
//   fetchTabs(docId)        → { title, tabs: [{ id, title, path }] } (tabs + sub-tabs, in order)
//   exportDocx(docId, tab?) → { buffer, fileName } the whole document, or one tab, as .docx
//
// Google has no public, key-less API for the tab list, so it is read from the document page
// (`{"ty":"ac","d":["t.xxx",[1,"Title"],[2,0]]}` = tab "Title", first sub-tab of the 3rd tab).
// If Google changes that format, fetchTabs() returns no tabs and the importer falls back to
// importing the whole document (which still works).
const ApiError = require('../utils/ApiError');

const MAX_DOWNLOAD = 60 * 1024 * 1024;
const NOT_SHARED = 'Google did not share this document. In Google Docs choose Share → General access → “Anyone with the link”, or download it as .docx (File → Download) and upload the file.';

function docIdFrom(url) {
  const m = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/.exec(String(url || '').trim());
  if (!m) throw ApiError.badRequest('Paste a Google Docs link like https://docs.google.com/document/d/…');
  return m[1];
}

const isGoogle = (host) => host === 'docs.google.com' || host.endsWith('.googleusercontent.com') || host.endsWith('.google.com');

/** GET with redirects followed by hand (so we never leave Google), a size cap and a timeout. */
async function get(url, { timeoutMs = 4 * 60 * 1000, accept } = {}) {
  let next = url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 6; hop += 1) {
      if (!isGoogle(new URL(next).hostname)) throw ApiError.badRequest('Unexpected redirect while downloading the document');
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(next, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (LearningHub importer)', ...(accept ? { Accept: accept } : {}) } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        next = new URL(res.headers.get('location'), next).href;
        if (/accounts\.google\.com|ServiceLogin/.test(next)) throw ApiError.badRequest(NOT_SHARED);
        continue;
      }
      if ([401, 403, 404].includes(res.status)) throw ApiError.badRequest(NOT_SHARED);
      if (!res.ok) throw ApiError.badRequest(`Google Docs answered ${res.status}. Try again, or upload the file as .docx.`);
      if (Number(res.headers.get('content-length') || 0) > MAX_DOWNLOAD) throw ApiError.badRequest('This document is too large to import (over 60 MB)');
      const chunks = [];
      let size = 0;
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > MAX_DOWNLOAD) throw ApiError.badRequest('This document is too large to import (over 60 MB)');
        chunks.push(chunk);
      }
      return { buffer: Buffer.concat(chunks), headers: res.headers };
    }
    throw ApiError.badRequest('Too many redirects while downloading the document');
  } catch (err) {
    if (err.name === 'AbortError') throw ApiError.badRequest('Google Docs took too long to answer. Try again, or download the document as .docx and upload the file.');
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest('Could not download the document from Google Docs. Check the link and your internet connection.');
  } finally {
    clearTimeout(timer);
  }
}

/** Tabs from the document page. Exported for tests. */
function parseTabs(html) {
  const unjson = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
  const title = unjson(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1]
    || /<title>([^<]*?)(?: - Google Docs)?<\/title>/.exec(html)?.[1] || 'Google document')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const seen = new Set();
  const tabs = [];
  const re = /\{"ty":"ac","d":\["(t\.[a-z0-9]{6,20})",\[1,"((?:[^"\\]|\\.)*)"\],\[([\d,]*)\]/g;
  let m;
  while ((m = re.exec(html))) {
    if (seen.has(m[1]) || !m[3]) continue;
    seen.add(m[1]);
    tabs.push({ id: m[1], title: unjson(m[2]).trim() || 'Untitled tab', path: m[3].split(',').map(Number) });
  }
  // The first tab ("t.0") is not in that list. Add it; its name is taken from its first line later.
  if (tabs.length && !tabs.some((t) => t.path.length === 1 && t.path[0] === 0) && /"t\.0"/.test(html)) {
    tabs.push({ id: 't.0', title: '', path: [0] });
  }
  // order like the sidebar of Google Docs: by path
  tabs.sort((a, b) => {
    for (let i = 0; i < Math.max(a.path.length, b.path.length); i += 1) {
      if (a.path[i] === undefined) return -1;
      if (b.path[i] === undefined) return 1;
      if (a.path[i] !== b.path[i]) return a.path[i] - b.path[i];
    }
    return 0;
  });
  // sanity check: every sub-tab's parent must exist, otherwise don't trust the result
  const paths = new Set(tabs.map((t) => t.path.join(',')));
  const consistent = tabs.every((t) => t.path.length === 1 || paths.has(t.path.slice(0, -1).join(',')));
  return { title: title.trim() || 'Google document', tabs: consistent ? tabs : [] };
}

const googleDocs = {
  docIdFrom,
  parseTabs,

  async fetchTabs(docId) {
    try {
      const { buffer } = await get(`https://docs.google.com/document/d/${docId}/edit`, { timeoutMs: 90 * 1000, accept: 'text/html' });
      return parseTabs(buffer.toString('utf8'));
    } catch (err) {
      if (err instanceof ApiError && err.message === NOT_SHARED) throw err;
      return { title: 'Google document', tabs: [] }; // fall back to the whole document
    }
  },

  async exportDocx(docId, tabId) {
    const url = `https://docs.google.com/document/d/${docId}/export?format=docx${tabId ? `&tab=${encodeURIComponent(tabId)}` : ''}`;
    // one tab is small (the biggest takes ~10 s): give up early on a stalled request so it can be retried
    const { buffer, headers } = await get(url, { timeoutMs: tabId ? 75 * 1000 : 4 * 60 * 1000 });
    if ((headers.get('content-type') || '').includes('text/html')) throw ApiError.badRequest(NOT_SHARED);
    const disposition = headers.get('content-disposition') || '';
    const name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] || /filename="([^"]+)"/i.exec(disposition)?.[1];
    return { buffer, fileName: name ? decodeURIComponent(name) : 'Google document' };
  },
};

module.exports = googleDocs;
