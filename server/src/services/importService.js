// Import a prepared document (Word .docx / Google Docs) as categories + pages.
//   1. start()   read the file (upload or Google Docs link) → analysis + suggested split rule
//   2. preview() outline for a rule (the user can rename pages or merge them into the previous one)
//   3. commit()  create the categories / pages and save the images
// The parsed document is kept in memory between the steps for a short time (it can be large).
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const sectionRepository = require('../repositories/sectionRepository');
const questionRepository = require('../repositories/questionRepository');
const { ownerFor, assertCanPlaceIn } = require('./access');
const { readDocx } = require('../import/docxReader');
const { analyse, outline, pageBlocks, chunkBlocks } = require('../import/outline');

const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 6;
const MAX_DOWNLOAD = 60 * 1024 * 1024;
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const MAX_IMAGE = 15 * 1024 * 1024;

const sessions = new Map(); // id → { user, fileName, elements, zip, analysis, at }

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > TTL_MS) sessions.delete(id);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value); // oldest first
}
setInterval(sweep, 60 * 1000).unref();

function getSession(user, id) {
  const s = sessions.get(id);
  if (!s || s.user !== String(user.id)) throw ApiError.notFound('This import has expired. Please upload the document again.');
  s.at = Date.now();
  return s;
}

// Reading a big document needs a lot of memory for a moment: read one document at a time.
let queue = Promise.resolve();
const oneAtATime = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/** Accepts a Google Docs link, returns the .docx export of that document. */
async function downloadGoogleDoc(url) {
  const m = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/.exec(String(url).trim());
  if (!m) throw ApiError.badRequest('Paste a Google Docs link like https://docs.google.com/document/d/…');
  let next = `https://docs.google.com/document/d/${m[1]}/export?format=docx`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4 * 60 * 1000);
  try {
    // follow redirects ourselves so we only ever talk to Google
    for (let hop = 0; hop < 5; hop += 1) {
      const host = new URL(next).hostname;
      if (!(host === 'docs.google.com' || host.endsWith('.googleusercontent.com') || host.endsWith('.google.com'))) {
        throw ApiError.badRequest('Unexpected redirect while downloading the document');
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(next, { redirect: 'manual', signal: controller.signal });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { next = new URL(res.headers.get('location'), next).href; continue; }
      const type = res.headers.get('content-type') || '';
      if (res.status === 401 || res.status === 403 || res.status === 404 || type.includes('text/html')) {
        throw ApiError.badRequest('Google did not share this document. In Google Docs choose Share → General access → “Anyone with the link”, or download it as .docx (File → Download) and upload the file.');
      }
      if (!res.ok) throw ApiError.badRequest(`Google Docs answered ${res.status}. Try again, or upload the file as .docx.`);
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_DOWNLOAD) throw ApiError.badRequest('This document is too large to import (over 60 MB)');
      const chunks = [];
      let size = 0;
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > MAX_DOWNLOAD) throw ApiError.badRequest('This document is too large to import (over 60 MB)');
        chunks.push(chunk);
      }
      const disposition = res.headers.get('content-disposition') || '';
      const name = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] || /filename="([^"]+)"/i.exec(disposition)?.[1];
      return { buffer: Buffer.concat(chunks), fileName: name ? decodeURIComponent(name) : 'Google document' };
    }
    throw ApiError.badRequest('Too many redirects while downloading the document');
  } catch (err) {
    if (err.name === 'AbortError') throw ApiError.badRequest('Google Docs took too long to export this document. Download it as .docx and upload the file instead.');
    if (err instanceof ApiError) throw err;
    throw ApiError.badRequest('Could not download the document from Google Docs. Check the link and your internet connection.');
  } finally {
    clearTimeout(timer);
  }
}

const baseName = (fileName) => String(fileName || 'Imported document').replace(/\.(docx|doc)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Imported document';

/** Re-apply the user's edits from the preview: renamed titles and "merge into the previous page". */
function applyEdits(items, edits = []) {
  const byKey = new Map(edits.map((e) => [e.key, e]));
  const result = [];
  for (const it of items) {
    const e = byKey.get(it.key);
    if (e?.skip && it.type === 'page') continue;                              // excluded by the user
    const title = e?.title?.trim() ? e.title.trim().slice(0, it.type === 'category' ? 120 : 300) : it.title;
    const prev = result[result.length - 1];
    if (e?.merge && it.type === 'page' && prev?.type === 'page') {
      prev.mergedFrom.push({ start: it.start, end: it.end, titleElement: it.titleElement, title });
      continue;
    }
    result.push({ ...it, title, mergedFrom: [] });
  }
  return result;
}

const importService = {
  async start(user, { file, url }) {
    let buffer;
    let fileName;
    if (file) {
      if (!/\.docx$/i.test(file.originalname)) {
        throw ApiError.badRequest(/\.doc$/i.test(file.originalname)
          ? 'Old .doc files are not supported: open it in Word and “Save as” .docx, then upload that.'
          : 'Upload a Word document (.docx). From Google Docs: File → Download → Microsoft Word (.docx).');
      }
      ({ buffer } = file);
      fileName = file.originalname;
    } else if (url) {
      ({ buffer, fileName } = await downloadGoogleDoc(url));
    } else {
      throw ApiError.badRequest('Choose a .docx file or paste a Google Docs link');
    }
    const { elements, zip } = await oneAtATime(() => readDocx(buffer));
    if (!elements.some((e) => e.t !== 'blank')) throw ApiError.badRequest('The document is empty');
    const name = baseName(fileName);
    const analysis = analyse(elements, name);
    const id = crypto.randomUUID();
    sweep();
    sessions.set(id, { user: String(user.id), fileName: name, elements, zip, analysis, at: Date.now() });
    return { id, ...analysis };
  },

  preview(user, id, rule) {
    const s = getSession(user, id);
    const items = outline(s.elements, rule, s.fileName);
    return {
      items: items.map(({ key, type, depth, title, stats }) => ({ key, type, depth, title, ...(stats ? { stats } : {}) })),
      pages: items.filter((i) => i.type === 'page').length,
      categories: items.filter((i) => i.type === 'category').length,
    };
  },

  async commit(user, id, { rule, parent = null, newCategory, items: edits }) {
    const s = getSession(user, id);
    const owner = ownerFor(user);
    const parentNode = parent ? await sectionRepository.findById(parent) : null;
    if (parent && !parentNode) throw ApiError.notFound('Category not found');
    assertCanPlaceIn(user, parentNode, owner);
    if (!parent && !newCategory) throw ApiError.badRequest('Choose a category to import into, or create a new one');

    const items = applyEdits(outline(s.elements, rule, s.fileName), edits);
    if (!items.some((i) => i.type === 'page')) throw ApiError.badRequest('Nothing to import: every page was excluded');

    const createdNodes = [];
    const createdPages = [];
    const savedFiles = [];
    try {
      // 1. the container category (optional)
      let root = parent || null;
      if (newCategory) {
        const node = await sectionRepository.create({
          title: newCategory.title.trim().slice(0, 120) || s.fileName,
          icon: newCategory.icon || '📥',
          color: newCategory.color || parentNode?.color || '#6366f1',
          description: newCategory.description || `Imported from “${s.fileName}”`,
          parent: root, owner, order: (await sectionRepository.maxOrder(root)) + 1,
        });
        createdNodes.push(node._id);
        root = node._id;
      }

      // 2. images: saved once each, on first use
      const imageUrls = new Map();
      let imageCount = 0;
      const imageUrl = async (media) => {
        if (imageUrls.has(media)) return imageUrls.get(media);
        const ext = path.extname(media).slice(1).toLowerCase();
        const file = s.zip.file(media);
        let url = null;
        if (IMAGE_TYPES[ext] && file) {
          const data = await file.async('nodebuffer');
          if (data.length <= MAX_IMAGE) {
            const name = `${Date.now()}-${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
            await fs.writeFile(path.join(config.uploadDir, name), data);
            savedFiles.push(name);
            url = `/uploads/${name}`;
            imageCount += 1;
          }
        }
        imageUrls.set(media, url);
        return url;
      };

      // 3. categories and pages, in document order
      const parentAt = [root]; // depth → node id
      const orderIn = new Map();
      const nextOrder = async (key, getMax) => {
        if (!orderIn.has(key)) orderIn.set(key, await getMax());
        orderIn.set(key, orderIn.get(key) + 1);
        return orderIn.get(key);
      };
      for (const it of items) {
        const container = parentAt[Math.min(it.depth, parentAt.length - 1)];
        if (it.type === 'category') {
          const node = await sectionRepository.create({
            title: it.title, icon: '📁', color: parentNode?.color || '#6366f1', description: '',
            parent: container, owner,
            order: await nextOrder(`n${container}`, () => sectionRepository.maxOrder(container)),
          });
          createdNodes.push(node._id);
          parentAt.length = it.depth + 1;
          parentAt[it.depth + 1] = node._id;
          continue;
        }
        if (!container) throw ApiError.badRequest('Pages need a category: choose one or create a new category');
        const blocks = await pageBlocks(s.elements, it, { imageUrl, mergedFrom: it.mergedFrom });
        const chunks = chunkBlocks(blocks);
        for (const [n, chunk] of chunks.entries()) {
          const q = await questionRepository.create({
            section: container, owner, priority: 2, tags: ['imported'],
            title: chunks.length > 1 ? `${it.title} (part ${n + 1})` : it.title,
            order: await nextOrder(`q${container}`, () => questionRepository.maxOrderInSection(container)),
            blocks: chunk,
            quickNotes: [],
          });
          createdPages.push(q._id);
        }
      }

      sessions.delete(id);
      return { category: root, categories: createdNodes.length, pages: createdPages.length, images: imageCount };
    } catch (err) {
      // undo a half-finished import
      await Promise.all([
        createdNodes.length && sectionRepository.deleteMany({ _id: { $in: createdNodes } }),
        createdPages.length && questionRepository.deleteMany({ _id: { $in: createdPages } }),
        ...savedFiles.map((f) => fs.unlink(path.join(config.uploadDir, f)).catch(() => {})),
      ]);
      throw err;
    }
  },

  cancel(user, id) {
    getSession(user, id);
    sessions.delete(id);
  },
};

module.exports = importService;
module.exports.applyEdits = applyEdits;
