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

const CURRENT = 12;
// v3 (Oct 2026): glossary terms + React sections (files 22-26) added to existing databases
const V3_FILES = ['22-react-fundamentals.md', '23-react-hooks.md', '24-react-performance.md', '25-react-suspense.md', '26-react-19.md'];
// v4 (Oct 2026): JavaScript sections (files 27-33) + any new glossary terms
const V4_FILES = ['27-js-basics.md', '28-js-functions-scope.md', '29-js-objects-prototypes.md', '30-js-async.md', '31-js-browser.md', '32-js-polyfills.md', '33-js-design-patterns.md'];
// v5 (Oct 2026): TypeScript, Next.js and Testing (files 34-41); Node.js/Express/REST pages put in learning order
const V5_FILES = ['34-typescript-fundamentals.md', '35-typescript-advanced.md', '36-nextjs-fundamentals.md', '37-nextjs-data.md', '38-testing-fundamentals.md', '39-react-testing-library.md', '40-e2e-testing.md', '41-node-testing.md'];
const V5_REORDERED = ['01-node-core.md', '02-express.md', '03-rest-auth.md'];
const V5_NODE_ORDER = ['testing/common', 'testing/frontend', 'testing/backend'];
// v6 (Oct 2026): Web Security (file 42); new questions in Browser (31) and TypeScript (34, 35), put in learning order
const V6_FILES = ['42-web-security.md', '31-js-browser.md', '34-typescript-fundamentals.md', '35-typescript-advanced.md'];
const V6_REORDERED = ['31-js-browser.md', '34-typescript-fundamentals.md', '35-typescript-advanced.md'];
const V6_NODE_ORDER = ['frontend/security', 'frontend/html-css'];
// v7 (Oct 2026): Node.js roadmap phases 1-2: Runtime & Modules (43), Core Modules (44), output puzzles in Node core (01)
const V7_FILES = ['43-node-runtime.md', '44-node-core-modules.md'];
const V7_NEW_IN_EXISTING = { files: ['01-node-core.md'], titles: ['Predict the output: Node.js event loop puzzles (nextTick, Promise, setTimeout, setImmediate)'] };
const V7_REORDERED = ['01-node-core.md'];
const V7_NODE_ORDER = ['backend/nodejs/core', 'backend/nodejs/runtime', 'backend/nodejs/modules', 'backend/nodejs/express'];
// v8 (Oct 2026): HTTP Fundamentals (45), Validation & Error Handling (46), Streams & Buffers (47), API evolution in REST (03)
const V8_FILES = ['45-http-fundamentals.md', '46-node-validation-errors.md', '47-node-streams-buffers.md'];
const V8_NEW_IN_EXISTING = { files: ['03-rest-auth.md'], titles: ['How do you evolve an API without breaking clients? (compatibility, partial updates, bulk APIs, HATEOAS)'] };
const V8_REORDERED = ['03-rest-auth.md'];
const V8_NODE_ORDER = ['backend/nodejs/core', 'backend/nodejs/runtime', 'backend/nodejs/modules', 'backend/nodejs/streams', 'backend/nodejs/express', 'backend/nodejs/validation-errors',
  'backend/common/http-fundamentals', 'backend/common/rest-auth', 'backend/common/caching', 'backend/common/messaging', 'backend/common/security'];
// v9 (Oct 2026): Node.js Database Integration (48), SQL Fundamentals (49), PostgreSQL (50; fills the SQL/PostgreSQL placeholders)
const V9_FILES = ['48-node-database-integration.md', '49-sql-fundamentals.md', '50-postgresql.md'];
const V9_NODE_ORDER = ['backend/nodejs/validation-errors', 'backend/nodejs/database'];
// v10 (Oct 2026): Real-Time: WebSockets & SSE (51)
const V10_FILES = ['51-realtime.md'];
const V10_NODE_ORDER = ['backend/nodejs/database', 'backend/nodejs/realtime'];
// v11 (Oct 2026): Redis (52) and Caching (53) fill their placeholders
const V11_FILES = ['52-redis.md', '53-caching.md'];
// v12 (Oct 2026): Messaging & Queues (54) and Background Jobs, Scheduling & Email (55) under Common → Messaging & Queues
const V12_FILES = ['54-messaging-queues.md', '55-background-jobs.md'];

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
    if (version == null || version < 6) {
      const r = await addMissingDefaults(V6_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const moved = await reorderDefaultPages(V6_REORDERED);
      const nodes = await syncDefaultNodeOrder(V6_NODE_ORDER);
      console.log(`🔁 Migrated to v6: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms, ${moved} pages and ${nodes} categories put in learning order`);
    }
    if (version == null || version < 7) {
      const r = await addMissingDefaults(V7_FILES);
      const r2 = await addMissingDefaults(V7_NEW_IN_EXISTING.files, { titles: V7_NEW_IN_EXISTING.titles });
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const moved = await reorderDefaultPages(V7_REORDERED);
      const nodes = await syncDefaultNodeOrder(V7_NODE_ORDER);
      console.log(`🔁 Migrated to v7: ${r.addedNodes} new categories, ${r.addedPages + r2.addedPages} new pages, ${terms} glossary terms, ${moved} pages and ${nodes} categories put in learning order`);
    }
    if (version == null || version < 8) {
      const r = await addMissingDefaults(V8_FILES);
      const r2 = await addMissingDefaults(V8_NEW_IN_EXISTING.files, { titles: V8_NEW_IN_EXISTING.titles });
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const moved = await reorderDefaultPages(V8_REORDERED);
      const nodes = await syncDefaultNodeOrder(V8_NODE_ORDER);
      console.log(`🔁 Migrated to v8: ${r.addedNodes} new categories, ${r.addedPages + r2.addedPages} new pages, ${terms} glossary terms, ${moved} pages and ${nodes} categories put in learning order`);
    }
    if (version == null || version < 9) {
      const r = await addMissingDefaults(V9_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const nodes = await syncDefaultNodeOrder(V9_NODE_ORDER);
      console.log(`🔁 Migrated to v9: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms, ${nodes} categories put in learning order`);
    }
    if (version == null || version < 10) {
      const r = await addMissingDefaults(V10_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      const nodes = await syncDefaultNodeOrder(V10_NODE_ORDER);
      console.log(`🔁 Migrated to v10: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms, ${nodes} categories put in learning order`);
    }
    if (version == null || version < 11) {
      const r = await addMissingDefaults(V11_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      console.log(`🔁 Migrated to v11: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms`);
    }
    if (version == null || version < 12) {
      const r = await addMissingDefaults(V12_FILES);
      const terms = await insertDefaultTerms(new Map(), { onlyMissing: true });
      console.log(`🔁 Migrated to v12: ${r.addedNodes} new categories, ${r.addedPages} new pages, ${terms} glossary terms`);
    }
  }
  await setVersion(CURRENT);
}

module.exports = { migrate, CURRENT, V3_FILES, V4_FILES, V5_FILES, V6_FILES, V7_FILES, V8_FILES, V9_FILES, V10_FILES, V11_FILES, V12_FILES };
