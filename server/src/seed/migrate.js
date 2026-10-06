// Schema migrations, run once at startup. Each step is idempotent and recorded in Meta("schemaVersion").
//
// v2: flat sections → tree + users.
//   - keeps every existing section, page, id and edit
//   - places each old section into the new tree (matched by title against the seed files)
//   - adds the default skeleton (Frontend, Backend, … with empty placeholders)
//   - moves per-page status/star out of the pages into a stash that the first admin account claims
const mongoose = require('mongoose');
const Meta = require('../models/Meta');
const Section = require('../models/Section');
const { defaultNodes, seedIfEmpty, insertDefaultTerms, addMissingDefaults, reorderDefaultPages, syncDefaultNodeOrder, UNCATEGORISED } = require('./index');

const CURRENT = 5;
// v3 (Oct 2026): glossary terms + React sections (files 22-26) added to existing databases
const V3_FILES = ['22-react-fundamentals.md', '23-react-hooks.md', '24-react-performance.md', '25-react-suspense.md', '26-react-19.md'];
// v4 (Oct 2026): JavaScript sections (files 27-33) + any new glossary terms
const V4_FILES = ['27-js-basics.md', '28-js-functions-scope.md', '29-js-objects-prototypes.md', '30-js-async.md', '31-js-browser.md', '32-js-polyfills.md', '33-js-design-patterns.md'];
// v5 (Oct 2026): TypeScript, Next.js and Testing (files 34-41); Node.js/Express/REST pages put in learning order
const V5_FILES = ['34-typescript-fundamentals.md', '35-typescript-advanced.md', '36-nextjs-fundamentals.md', '37-nextjs-data.md', '38-testing-fundamentals.md', '39-react-testing-library.md', '40-e2e-testing.md', '41-node-testing.md'];
const V5_REORDERED = ['01-node-core.md', '02-express.md', '03-rest-auth.md'];
const V5_NODE_ORDER = ['testing/common', 'testing/frontend', 'testing/backend'];

async function getVersion() {
  return (await Meta.findById('schemaVersion').lean())?.value ?? null;
}
const setVersion = (v) => Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: v } }, { upsert: true });

async function migrateToV2() {
  const raw = mongoose.connection.db;
  const questions = raw.collection('questions');

  // 1) Stash per-page progress (old schema stored it on the page itself)
  const legacy = await questions.find({ $or: [{ status: { $exists: true, $ne: 'new' } }, { starred: true }] }, { projection: { status: 1, starred: 1 } }).toArray();
  if (legacy.length) {
    await Meta.updateOne({ _id: 'legacyProgress' }, { $set: { value: legacy.map((q) => ({ question: q._id, status: q.status || 'new', starred: !!q.starred })) } }, { upsert: true });
  }
  await questions.updateMany({}, { $unset: { status: '', starred: '' } });
  await questions.updateMany({ owner: { $exists: false } }, { $set: { owner: null } });

  // 2) Create the skeleton and attach the old sections where they belong
  const nodes = defaultNodes();
  const byTitle = new Map(nodes.filter((n) => n.seedFile).map((n) => [n.title.toLowerCase(), n]));
  const old = await Section.find({ key: { $exists: false } }).lean();
  const idByKey = new Map();
  const oldMatched = new Map();                         // old section id → default node
  for (const s of old) {
    const match = byTitle.get(s.title.toLowerCase());
    if (match && !idByKey.has(match.key)) { idByKey.set(match.key, s._id); oldMatched.set(String(s._id), match); }
  }
  for (const n of nodes.filter((x) => !x.seedFile)) {
    const existing = await Section.findOne({ key: n.key }).lean();
    idByKey.set(n.key, existing ? existing._id : new mongoose.Types.ObjectId());
  }
  for (const n of nodes.filter((x) => !x.seedFile)) {
    await Section.updateOne(
      { _id: idByKey.get(n.key) },
      { $setOnInsert: { key: n.key, owner: null, parent: n.parentKey ? idByKey.get(n.parentKey) : null, title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order } },
      { upsert: true },
    );
  }
  let uncategorisedId = null;
  for (const s of old) {
    const match = oldMatched.get(String(s._id));
    if (match) {
      await Section.updateOne({ _id: s._id }, { $set: { key: match.key, seedFile: match.seedFile, owner: null, parent: idByKey.get(match.parentKey), order: match.order } });
    } else {
      if (!uncategorisedId) {
        uncategorisedId = (await Section.findOneAndUpdate({ key: UNCATEGORISED.key }, { $setOnInsert: { ...UNCATEGORISED, owner: null, parent: null, order: 1000 } }, { upsert: true, new: true }))._id;
      }
      await Section.updateOne({ _id: s._id }, { $set: { owner: null, parent: uncategorisedId } });
    }
  }
  return { stashedProgress: legacy.length, placed: oldMatched.size, uncategorised: old.length - oldMatched.size };
}

async function migrate() {
  const version = await getVersion();
  if (version === CURRENT) return;
  if (version == null && (await Section.countDocuments()) === 0) {
    await seedIfEmpty();                                // fresh install: seed straight into the new schema
  } else {
    if (version == null || version < 2) {
      const r = await migrateToV2();
      console.log(`🔁 Migrated to v2: ${r.placed} sections placed in the tree, ${r.uncategorised} uncategorised, ${r.stashedProgress} progress rows kept for the first admin`);
    }
    if (version == null || version < 3) {
      const r = await addMissingDefaults(V3_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      console.log(`🔁 Migrated to v3: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms (nothing existing was changed)`);
    }
    if (version == null || version < 4) {
      const r = await addMissingDefaults(V4_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      console.log(`🔁 Migrated to v4: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms (nothing existing was changed)`);
    }
    if (version == null || version < 5) {
      const r = await addMissingDefaults(V5_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const moved = await reorderDefaultPages(V5_REORDERED);
      const nodes = await syncDefaultNodeOrder(V5_NODE_ORDER);
      console.log(`🔁 Migrated to v5: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms, ${moved} pages and ${nodes} categories put in learning order`);
    }
  }
  await setVersion(CURRENT);
}

module.exports = { migrate, CURRENT, V3_FILES, V4_FILES, V5_FILES };
