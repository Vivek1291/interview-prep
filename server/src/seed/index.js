const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseFile } = require('./parser');
const { flatten, filePlacements } = require('./taxonomy');
const Section = require('../models/Section');
const Question = require('../models/Question');
const Term = require('../models/Term');
const { recoverOrphans } = require('../services/maintenance');

const CONTENT_DIR = path.join(__dirname, 'content');
const UNCATEGORISED = { key: 'uncategorised', title: 'Uncategorised', icon: '📂', color: '#64748b', description: 'Content that has no place in the tree yet.' };

const TERMS_FILE = path.join(__dirname, 'terms.md');
const termKey = (term) => `term/${term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Default glossary terms from seed/terms.md → [{ key, term, aliases, summary, blocks }] */
function loadTerms() {
  if (!fs.existsSync(TERMS_FILE)) return [];
  const { questions } = parseFile(`@section Terms\n${fs.readFileSync(TERMS_FILE, 'utf8')}`, 'terms.md');
  return questions.map((q) => ({ key: termKey(q.title), term: q.title, aliases: q.aliases || [], summary: q.summary || '', blocks: q.blocks }));
}

/** Insert the default terms that are missing (by key). `reuse`: key → _id keeps ids stable across resets. */
async function insertDefaultTerms(reuse = new Map(), { onlyMissing = false } = {}) {
  let terms = loadTerms();
  if (onlyMissing) {
    const existing = new Set((await Term.find({ key: { $in: terms.map((t) => t.key) } }, 'key').lean()).map((t) => t.key));
    terms = terms.filter((t) => !existing.has(t.key));
  }
  if (terms.length) await Term.insertMany(terms.map((t) => ({ ...t, _id: reuse.get(t.key) || new mongoose.Types.ObjectId(), owner: null })));
  return terms.length;
}

function loadContent() {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ file: f, ...parseFile(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'), f) }));
}

/**
 * Build the list of default nodes (skeleton + one node per content file) with stable keys.
 * Returns [{ key, parentKey, title, icon, color, description, order, seedFile?, questions? }]
 */
function defaultNodes(files = loadContent()) {
  const skeleton = flatten().filter((n) => n.title);                 // untitled entries are file nodes
  const placements = filePlacements();
  // A titled node's own files become its first children, so its structural children move down by that many.
  const filesOf = new Map(flatten().map((n) => [n.key, n.title ? n.files?.length || 0 : 0]));
  const nodes = skeleton.map(({ files, ...n }) => ({ ...n, order: n.order + (filesOf.get(n.parentKey) || 0) }));
  const fileCountUnder = {};
  for (const f of files) {
    const place = placements[f.file] || { parentKey: UNCATEGORISED.key, nodeKey: `${UNCATEGORISED.key}/${f.file.replace(/\.md$/, '')}` };
    if (place.parentKey === UNCATEGORISED.key && !nodes.some((n) => n.key === UNCATEGORISED.key)) {
      nodes.push({ ...UNCATEGORISED, parentKey: null, order: 1000 });
    }
    // order: a file node keeps its slot among its siblings; files listed on a titled node come first
    const skeletonEntry = flatten().find((n) => n.key === place.nodeKey);
    const order = skeletonEntry ? skeletonEntry.order : (fileCountUnder[place.parentKey] = (fileCountUnder[place.parentKey] ?? -1) + 1);
    nodes.push({ key: place.nodeKey, parentKey: place.parentKey, order, seedFile: f.file, ...f.section, questions: f.questions });
  }
  return nodes;
}

/**
 * Insert the default (common) tree. `reuse` keeps ids stable across resets:
 *   reuse.nodes: key → _id          (users' private sub-items stay attached)
 *   reuse.pages: "nodeKey|title" → _id   (users' progress stays attached)
 */
async function insertDefaults(reuse = { nodes: new Map(), pages: new Map() }) {
  const nodes = defaultNodes();
  const idByKey = new Map(nodes.map((n) => [n.key, reuse.nodes.get(n.key) || new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: idByKey.get(n.key), key: n.key, seedFile: n.seedFile, owner: null,
    parent: n.parentKey ? idByKey.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  let questionCount = 0;
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({
      ...q, _id: reuse.pages.get(`${n.key}|${q.title}`) || new mongoose.Types.ObjectId(), section: idByKey.get(n.key), owner: null, order: i,
    })));
    questionCount += n.questions.length;
  }
  return { sections: nodes.length, questions: questionCount };
}

async function seedIfEmpty() {
  const count = await Section.countDocuments();
  if (count > 0) {
    console.log(`📚 Database already has ${count} categories — skipping seed`);
    return false;
  }
  const result = await insertDefaults();
  const terms = await insertDefaultTerms();
  console.log(`🌱 Seeded ${result.sections} categories, ${result.questions} pages and ${terms} terms`);
  return true;
}

/** Restore the default COMMON content. Users' private content and progress are kept. */
async function resetToDefaults() {
  const common = await Section.find({ owner: null }).lean();
  const keyById = new Map(common.filter((n) => n.key).map((n) => [String(n._id), n.key]));
  const reuse = { nodes: new Map(common.filter((n) => n.key).map((n) => [n.key, n._id])), pages: new Map() };
  for (const p of await Question.find({ owner: null }, 'section title').lean()) {
    const key = keyById.get(String(p.section));
    if (key) reuse.pages.set(`${key}|${p.title}`, p._id);
  }
  const termIds = new Map((await Term.find({ owner: null, key: { $ne: null } }, 'key').lean()).map((t) => [t.key, t._id]));
  await Promise.all([Section.deleteMany({ owner: null }), Question.deleteMany({ owner: null }), Term.deleteMany({ owner: null })]);
  const result = await insertDefaults(reuse);
  result.terms = await insertDefaultTerms(termIds);
  await recoverOrphans();
  return result;
}

/**
 * Add default content that a database doesn't have yet, WITHOUT touching anything that exists
 * (used by migrations when new seed files are released):
 *   - default categories whose key is missing are created (placeholders that became file nodes get their file)
 *   - pages of the given seed files are added to their category if no page with that title exists there
 */
async function addMissingDefaults(files) {
  const all = defaultNodes();
  // only the nodes of the new files and their ancestors (a category the admin deleted stays deleted)
  const byKey = new Map(all.map((n) => [n.key, n]));
  const wanted = new Set();
  for (const n of all.filter((x) => files.includes(x.seedFile))) {
    for (let k = n.key; k && !wanted.has(k); k = byKey.get(k)?.parentKey) wanted.add(k);
  }
  const nodes = all.filter((n) => wanted.has(n.key));
  const existing = new Map((await Section.find({ key: { $ne: null } }).lean()).map((n) => [n.key, n]));
  let addedNodes = 0;
  let addedPages = 0;
  for (const n of nodes) {                      // parents come before children in defaultNodes()
    const parent = n.parentKey ? existing.get(n.parentKey) : null;
    if (n.parentKey && !parent) continue;
    let node = existing.get(n.key);
    if (!node) {
      node = (await Section.create({
        key: n.key, seedFile: n.seedFile, owner: null, parent: parent?._id ?? null,
        title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
      })).toObject();
      existing.set(n.key, node);
      addedNodes += 1;
    } else if (n.seedFile && !node.seedFile && files.includes(n.seedFile)) {
      // an empty placeholder now gets its content file: take the file's title/icon/description
      await Section.updateOne({ _id: node._id }, { $set: { seedFile: n.seedFile, title: n.title, icon: n.icon, description: n.description || '' } });
    }
    if (n.questions && files.includes(n.seedFile)) {
      const titles = new Set((await Question.find({ section: node._id, owner: null }, 'title').lean()).map((q) => q.title));
      const last = await Question.findOne({ section: node._id }).sort({ order: -1 }).select('order').lean();
      const fresh = n.questions.filter((q) => !titles.has(q.title));
      if (fresh.length) {
        await Question.insertMany(fresh.map((q, i) => ({ ...q, section: node._id, owner: null, order: (last?.order ?? -1) + 1 + i })));
        addedPages += fresh.length;
      }
    }
  }
  return { addedNodes, addedPages };
}

module.exports = { seedIfEmpty, resetToDefaults, insertDefaults, insertDefaultTerms, addMissingDefaults, loadContent, loadTerms, defaultNodes, UNCATEGORISED };
