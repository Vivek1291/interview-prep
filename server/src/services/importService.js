// Import a prepared document (Word .docx / Google Docs) as categories + pages.
//
// Two ways, chosen when the document is read:
//   • tabs mode (Google Docs link with tabs): every tab is a page; tabs with sub-tabs become
//     sub-categories (or one page with sections). The user ticks which tabs to import.
//       start() → commitTabs() (runs in the background) → status() until done
//   • document mode (.docx upload, or a Google Doc without tabs): the document is split by
//     "Q)" lines or headings, with a preview.
//       start() → preview() → commit()
// The parsed document is kept in memory between the steps for a short time (it can be large).
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const sectionRepository = require('../repositories/sectionRepository');
const questionRepository = require('../repositories/questionRepository');
const { ownerFor, assertCanPlaceIn } = require('./access');
const { readDocx, esc } = require('../import/docxReader');
const { analyse, outline, pageBlocks, chunkBlocks } = require('../import/outline');
const google = require('../import/googleDocs');

const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 6;
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const MAX_IMAGE = 15 * 1024 * 1024;
const DOWNLOADS_AT_ONCE = 4;

const sessions = new Map(); // id → { user, mode, fileName, ... , at }

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > TTL_MS && s.job?.state !== 'running') sessions.delete(id);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value); // oldest first
}
setInterval(sweep, 60 * 1000).unref();

function getSession(user, id) {
  const s = sessions.get(id);
  if (!s || s.user !== String(user.id)) throw ApiError.notFound('This import has expired. Please start again.');
  s.at = Date.now();
  return s;
}

// Reading a big document needs a lot of memory for a moment: read one document at a time.
let queue = Promise.resolve();
const oneAtATime = (fn) => {
  const run = queue.then(() => fn());
  queue = run.catch(() => {});
  return run;
};

const baseName = (fileName) => String(fileName || 'Imported document').replace(/\.(docx|doc)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 120) || 'Imported document';
const hasContent = (elements) => elements.some((e) => e.t !== 'blank');
/** A short name from the first line of text ("Q) What is X?" → "What is X?"). */
function firstLine(elements) {
  const e = elements.find((x) => (x.t === 'h' || x.t === 'p') && x.text.trim());
  if (!e) return '';
  const t = e.text.replace(/\s+/g, ' ').trim().replace(/^(Q\s*\d*\s*[).:\-]|Question\s*\d*\s*[).:\-]?)\s*/i, '');
  return t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t;
}

/** Re-apply the user's edits from the preview: renamed titles, "merge into the previous page", skipped pages. */
function applyEdits(items, edits = []) {
  const byKey = new Map(edits.map((e) => [e.key, e]));
  const result = [];
  for (const it of items) {
    const e = byKey.get(it.key);
    if (e?.skip && it.type === 'page') continue;
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

/**
 * Create a plan of categories and pages under the chosen destination.
 * plan: [{ type: 'category', depth, title } | { type: 'page', depth, title, blocks: (imageUrl) => Promise<blocks> }]
 * images: (key) → { zip, media } so the same image is stored once.
 * Everything is removed again if something fails half-way.
 */
async function createPlan(user, { parent, newCategory, plan, images, defaultTitle, onPage }) {
  const owner = ownerFor(user);
  const parentNode = parent ? await sectionRepository.findById(parent) : null;
  if (parent && !parentNode) throw ApiError.notFound('Category not found');
  assertCanPlaceIn(user, parentNode, owner);
  if (!parent && !newCategory) throw ApiError.badRequest('Choose a category to import into, or create a new one');
  if (!plan.some((p) => p.type === 'page')) throw ApiError.badRequest('Nothing to import: no page has any content');

  const createdNodes = [];
  const createdPages = [];
  const savedFiles = [];
  try {
    let root = parent || null;
    if (newCategory) {
      const node = await sectionRepository.create({
        title: newCategory.title.trim().slice(0, 120) || defaultTitle,
        icon: newCategory.icon || '📥',
        color: newCategory.color || parentNode?.color || '#6366f1',
        description: newCategory.description || `Imported from “${defaultTitle}”`,
        parent: root, owner, order: (await sectionRepository.maxOrder(root)) + 1,
      });
      createdNodes.push(node._id);
      root = node._id;
    }

    const urls = new Map();
    let imageCount = 0;
    const imageUrl = async (key) => {
      if (urls.has(key)) return urls.get(key);
      const { zip, media } = images(key);
      const ext = path.extname(media).slice(1).toLowerCase();
      const file = zip?.file(media);
      let url = null;
      if (IMAGE_TYPES.includes(ext) && file) {
        const data = await file.async('nodebuffer');
        if (data.length <= MAX_IMAGE) {
          const name = `${Date.now()}-${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
          await fs.writeFile(path.join(config.uploadDir, name), data);
          savedFiles.push(name);
          url = `/uploads/${name}`;
          imageCount += 1;
        }
      }
      urls.set(key, url);
      return url;
    };

    const parentAt = [root]; // depth → category id
    const orderIn = new Map();
    const nextOrder = async (key, getMax) => {
      if (!orderIn.has(key)) orderIn.set(key, await getMax());
      orderIn.set(key, orderIn.get(key) + 1);
      return orderIn.get(key);
    };
    for (const it of plan) {
      const container = parentAt[Math.min(it.depth, parentAt.length - 1)];
      if (it.type === 'category') {
        const node = await sectionRepository.create({
          title: it.title.slice(0, 120), icon: it.icon || '📁', color: parentNode?.color || '#6366f1', description: '',
          parent: container, owner,
          order: await nextOrder(`n${container}`, () => sectionRepository.maxOrder(container)),
        });
        createdNodes.push(node._id);
        parentAt.length = it.depth + 1;
        parentAt[it.depth + 1] = node._id;
        continue;
      }
      if (!container) throw ApiError.badRequest('Pages need a category: choose one or create a new category');
      const chunks = chunkBlocks(await it.blocks(imageUrl));
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
      onPage?.(it);
    }
    return { category: root, categories: createdNodes.length, pages: createdPages.length, images: imageCount };
  } catch (err) {
    await Promise.all([
      createdNodes.length && sectionRepository.deleteMany({ _id: { $in: createdNodes } }),
      createdPages.length && questionRepository.deleteMany({ _id: { $in: createdPages } }),
      ...savedFiles.map((f) => fs.unlink(path.join(config.uploadDir, f)).catch(() => {})),
    ]);
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Tabs

/** Tabs as a tree: [{ id, title, path, children: [...] }] */
function tabTree(tabs) {
  const byPath = new Map(tabs.map((t) => [t.path.join(','), { ...t, children: [] }]));
  const roots = [];
  for (const t of byPath.values()) {
    const parentNode = byPath.get(t.path.slice(0, -1).join(','));
    (t.path.length > 1 && parentNode ? parentNode.children : roots).push(t);
  }
  return roots;
}

/**
 * Keep only the selected tabs. A selected tab whose parent is not selected moves up to its
 * nearest selected ancestor (or to the top).
 */
function selectTabs(roots, chosen) {
  const pick = (nodes) => nodes.flatMap((t) => {
    const kids = pick(t.children);
    const c = chosen.get(t.id);
    return c ? [{ ...t, title: c.title?.trim() || t.title, as: c.as || 'folder', children: kids }] : kids;
  });
  return pick(roots);
}

/** Plan for selected tabs, given each tab's parsed content. */
function planTabs(selected, content) {
  const plan = [];
  let skipped = 0;
  const own = (t) => content.get(t.id)?.elements || [];
  const tagged = (t) => own(t).map((e) => (e.t === 'img' ? { ...e, media: `${t.id}|${e.media}` } : e));
  const pageOf = (title, depth, elements) => ({
    type: 'page', depth, title: title.slice(0, 300),
    blocks: (imageUrl) => pageBlocks(elements, { start: 0, end: elements.length, titleElement: null }, { imageUrl }),
  });

  // "one page": the tab's text, then each sub-tab as a section (h2, h3, …)
  const flatten = (t, rel = 0) => [
    ...(rel ? [{ t: 'h', level: -10 + rel - 1, text: t.title, html: esc(t.title) }] : []),
    ...tagged(t),
    ...t.children.flatMap((c) => flatten(c, rel + 1)),
  ];

  const visit = (t, depth) => {
    if (t.children.length && t.as === 'page') {
      const els = flatten(t);
      if (hasContent(els)) plan.push(pageOf(t.title, depth, els)); else skipped += 1;
    } else if (t.children.length) {
      const start = plan.length;
      plan.push({ type: 'category', depth, title: t.title });
      if (hasContent(own(t))) plan.push(pageOf(t.title, depth + 1, tagged(t)));
      t.children.forEach((c) => visit(c, depth + 1));
      if (!plan.slice(start + 1).some((p) => p.type === 'page')) plan.splice(start, 1); // nothing inside
    } else if (hasContent(own(t))) {
      plan.push(pageOf(t.title, depth, tagged(t)));
    } else {
      skipped += 1;
    }
  };
  selected.forEach((t) => visit(t, 0));
  return { plan, skipped };
}

async function inPool(items, size, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      if (i >= tries || /did not share|too large/.test(err.message)) throw err;   // retries also cover a stalled download
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

// ---------------------------------------------------------------------------------------------

function docSession(user, { elements, zip, fileName, extra = {} }) {
  if (!hasContent(elements)) throw ApiError.badRequest('The document is empty');
  const name = baseName(fileName);
  return { user: String(user.id), mode: 'document', fileName: name, elements, zip, analysis: analyse(elements, name), ...extra };
}

const importService = {
  async start(user, { file, url }) {
    let session;
    if (file) {
      if (!/\.docx$/i.test(file.originalname)) {
        throw ApiError.badRequest(/\.doc$/i.test(file.originalname)
          ? 'Old .doc files are not supported: open it in Word and “Save as” .docx, then upload that.'
          : 'Upload a Word document (.docx). From Google Docs: File → Download → Microsoft Word (.docx).');
      }
      const { elements, zip } = await oneAtATime(() => readDocx(file.buffer));
      session = docSession(user, { elements, zip, fileName: file.originalname });
    } else if (url) {
      const docId = google.docIdFrom(url);
      const { title, tabs } = await google.fetchTabs(docId);
      if (tabs.length > 1) {
        // tabs without a stored name (the first tab): download them now and name them after their first line
        const prefetched = new Map();
        for (const t of tabs.filter((x) => !x.title)) {
          const parsed = await oneAtATime(async () => readDocx((await withRetry(() => google.exportDocx(docId, t.id))).buffer));
          prefetched.set(t.id, parsed);
          t.title = firstLine(parsed.elements) || 'First tab';
        }
        session = { user: String(user.id), mode: 'tabs', docId, fileName: baseName(title), tabs, prefetched };
      } else {
        const { buffer, fileName } = await google.exportDocx(docId);
        const { elements, zip } = await oneAtATime(() => readDocx(buffer));
        session = docSession(user, { elements, zip, fileName: tabs.length ? title : fileName, extra: { docId } });
      }
    } else {
      throw ApiError.badRequest('Choose a .docx file or paste a Google Docs link');
    }
    const id = crypto.randomUUID();
    sweep();
    sessions.set(id, { ...session, at: Date.now() });
    return importService.describe(id, session);
  },

  describe(id, s) {
    if (s.mode === 'tabs') return { id, mode: 'tabs', fileName: s.fileName, tabs: s.tabs.map(({ id: tid, title, path: p }) => ({ id: tid, title, path: p })) };
    return { id, mode: 'document', canUseTabs: false, ...s.analysis };
  },

  /** Tabs mode → "ignore the tabs": download the whole document and split it by headings / "Q)" instead. */
  async useWholeDocument(user, id) {
    const s = getSession(user, id);
    if (s.mode !== 'tabs') throw ApiError.badRequest('This import is already a whole document');
    const { buffer } = await google.exportDocx(s.docId);
    const { elements, zip } = await oneAtATime(() => readDocx(buffer));
    const next = docSession(user, { elements, zip, fileName: s.fileName, extra: { docId: s.docId, tabs: s.tabs, prefetched: s.prefetched } });
    sessions.set(id, { ...next, at: Date.now() });
    return { ...importService.describe(id, next), canUseTabs: true };
  },

  /** Back from whole-document mode to the tabs. */
  useTabs(user, id) {
    const s = getSession(user, id);
    if (!s.tabs?.length) throw ApiError.badRequest('This document has no tabs');
    const next = { user: s.user, mode: 'tabs', docId: s.docId, fileName: s.fileName, tabs: s.tabs, prefetched: s.prefetched };
    sessions.set(id, { ...next, at: Date.now() });
    return importService.describe(id, next);
  },

  preview(user, id, rule) {
    const s = getSession(user, id);
    if (s.mode !== 'document') throw ApiError.badRequest('Choose tabs to import instead');
    const items = outline(s.elements, rule, s.fileName);
    return {
      items: items.map(({ key, type, depth, title, stats }) => ({ key, type, depth, title, ...(stats ? { stats } : {}) })),
      pages: items.filter((i) => i.type === 'page').length,
      categories: items.filter((i) => i.type === 'category').length,
    };
  },

  async commit(user, id, { rule, parent = null, newCategory, items: edits }) {
    const s = getSession(user, id);
    if (s.mode !== 'document') throw ApiError.badRequest('Choose tabs to import instead');
    const items = applyEdits(outline(s.elements, rule, s.fileName), edits);
    if (!items.some((i) => i.type === 'page')) throw ApiError.badRequest('Nothing to import: every page was excluded');
    const plan = items.map((it) => (it.type === 'category' ? it : {
      ...it,
      blocks: (imageUrl) => pageBlocks(s.elements, it, { imageUrl, mergedFrom: it.mergedFrom }),
    }));
    const result = await createPlan(user, {
      parent, newCategory, plan, defaultTitle: s.fileName, images: (media) => ({ zip: s.zip, media }),
    });
    sessions.delete(id);
    return result;
  },

  /** Import the chosen tabs. Returns at once; poll status() for progress. */
  commitTabs(user, id, { parent = null, newCategory, tabs: chosenList }) {
    const s = getSession(user, id);
    if (s.mode !== 'tabs') throw ApiError.badRequest('This import has no tabs');
    if (s.job?.state === 'running') throw ApiError.conflict('This import is already running');
    const chosen = new Map(chosenList.map((c) => [c.id, c]));
    const selected = selectTabs(tabTree(s.tabs), chosen);
    const all = [];
    const walk = (t) => { all.push(t); t.children.forEach(walk); };
    selected.forEach(walk);
    if (!all.length) throw ApiError.badRequest('Tick at least one tab to import');
    if (!parent && !newCategory) throw ApiError.badRequest('Choose a category to import into, or create a new one');

    const job = { state: 'running', step: 'download', done: 0, total: all.length, current: '', result: null, error: null };
    s.job = job;
    (async () => {
      const content = new Map();
      await inPool(all, DOWNLOADS_AT_ONCE, async (t) => {
        job.current = t.title;
        let parsed = s.prefetched?.get(t.id);
        if (!parsed) {
          const { buffer } = await withRetry(() => google.exportDocx(s.docId, t.id));
          parsed = await oneAtATime(() => readDocx(buffer));
        }
        content.set(t.id, parsed);
        job.done += 1;
        s.at = Date.now();
      });
      const { plan, skipped } = planTabs(selected, content);
      job.step = 'save';
      job.done = 0;
      job.total = plan.filter((p) => p.type === 'page').length;
      job.current = '';
      const result = await createPlan(user, {
        parent, newCategory, plan, defaultTitle: s.fileName,
        images: (key) => { const [tabId, media] = key.split('|'); return { zip: content.get(tabId)?.zip, media }; },
        onPage: (p) => { job.done += 1; job.current = p.title; },
      });
      Object.assign(job, { state: 'done', result: { ...result, skipped } });
    })().catch((err) => {
      Object.assign(job, { state: 'error', error: err instanceof ApiError ? err.message : 'The import failed. Please try again.' });
    });
    return { ...job };
  },

  status(user, id) {
    const s = getSession(user, id);
    if (!s.job) throw ApiError.notFound('Nothing is being imported');
    const job = { ...s.job };
    if (job.state !== 'running') sessions.delete(id); // reported once, then the memory is freed
    return job;
  },

  cancel(user, id) {
    const s = getSession(user, id);
    if (s.job?.state === 'running') return; // let it finish; it cleans up after itself
    sessions.delete(id);
  },
};

module.exports = importService;
module.exports.applyEdits = applyEdits;
module.exports.planTabs = planTabs;
module.exports.selectTabs = selectTabs;
module.exports.tabTree = tabTree;
