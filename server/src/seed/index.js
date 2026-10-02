const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseFile } = require('./parser');
const { flatten, filePlacements } = require('./taxonomy');
const Section = require('../models/Section');
const Question = require('../models/Question');
const { recoverOrphans } = require('../services/maintenance');

const CONTENT_DIR = path.join(__dirname, 'content');
const UNCATEGORISED = { key: 'uncategorised', title: 'Uncategorised', icon: '📂', color: '#64748b', description: 'Content that has no place in the tree yet.' };

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
  console.log(`🌱 Seeded ${result.sections} categories and ${result.questions} pages`);
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
  await Promise.all([Section.deleteMany({ owner: null }), Question.deleteMany({ owner: null })]);
  const result = await insertDefaults(reuse);
  await recoverOrphans();
  return result;
}

module.exports = { seedIfEmpty, resetToDefaults, insertDefaults, loadContent, defaultNodes, UNCATEGORISED };
