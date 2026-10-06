// Migration v4 → v5: TypeScript, Next.js and Testing files are added, Node.js/Express/REST pages are put
// in learning order, and Testing Fundamentals moves first, without touching edits or private content.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v5_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, V5_FILES, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const owner = new mongoose.Types.ObjectId();
let expectedNewPages = 0;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();

  // A v4 database: everything except the v5 files; Testing had titled placeholders, Testing/Common last;
  // Node.js pages in the OLD order (event loop first).
  const all = loadContent();
  expectedNewPages = all.filter((f) => V5_FILES.includes(f.file)).reduce((n, f) => n + f.questions.length, 0);
  const nodes = defaultNodes(all.filter((f) => !V5_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    const qs = n.key === 'backend/nodejs/core' ? [...n.questions].reverse() : n.questions;   // simulate the old order
    await Question.insertMany(qs.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  const testing = ids.get('testing');
  const frontend = ids.get('testing/frontend');
  const backend = ids.get('testing/backend');
  await Section.updateOne({ _id: frontend }, { $set: { order: 0 } });
  await Section.updateOne({ _id: backend }, { $set: { order: 1 } });
  const common = await Section.create({ key: 'testing/common', owner: null, parent: testing, title: 'Common Topics', icon: '🧭', color: '#14b8a6', order: 2 });
  await Section.insertMany([
    { key: 'testing/frontend/react', owner: null, parent: frontend, title: 'React', icon: '⚛️', color: '#06b6d4', order: 0 },
    { key: 'testing/frontend/nextjs', owner: null, parent: frontend, title: 'Next.js', icon: '▲', color: '#64748b', order: 1 },
    { key: 'testing/backend/nodejs', owner: null, parent: backend, title: 'Node.js', icon: '🟢', color: '#22c55e', order: 0 },
  ]);
  await Question.create({ section: common._id, owner, title: 'My testing notes', priority: 2, order: 0 });     // private page
  const core = ids.get('backend/nodejs/core');
  await Question.create({ section: core, owner: null, title: 'Admin extra page', priority: 1, order: 99 });  // admin-added shared page
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 4 } }, { upsert: true });
  await migrate();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const byKey = (key) => Section.findOne({ key }).lean();

test('v5 adds TypeScript, Next.js and Testing content', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const ts = await Section.find({ parent: (await byKey('frontend/typescript'))._id }).sort({ order: 1 }).lean();
  assert.deepEqual(ts.map((n) => n.title), ['TypeScript Fundamentals', 'TypeScript Advanced & React']);
  const common = await byKey('testing/common');
  assert.equal(common.title, 'Testing Fundamentals', 'the placeholder now holds its content');
  assert.ok(await Question.findOne({ section: common._id, title: 'My testing notes', owner }), 'private page kept');
  assert.equal((await byKey('testing/frontend/react')).title, 'React Testing Library');
  const added = await Question.countDocuments({ owner: null, section: { $in: (await Section.find({ seedFile: { $in: V5_FILES } }, '_id').lean()).map((s) => s._id) } });
  assert.equal(added, expectedNewPages);
});

test('learning order: Testing Fundamentals first, What is Node.js first, admin pages kept after', async () => {
  const testing = await Section.find({ parent: (await byKey('testing'))._id }).sort({ order: 1 }).lean();
  assert.deepEqual(testing.map((n) => n.key), ['testing/common', 'testing/frontend', 'testing/backend']);
  const core = await Question.find({ section: (await byKey('backend/nodejs/core'))._id }).sort({ order: 1 }).lean();
  assert.equal(core[0].title, 'What is Node.js and why is it used?');
  assert.equal(core.at(-1).title, 'Admin extra page', 'pages not in the file stay, after the default ones');
});

test('running the migration again changes nothing', async () => {
  const sections = await Section.countDocuments();
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 4 } });
  await migrate();
  assert.equal(await Section.countDocuments(), sections);
  assert.equal(await Question.countDocuments(), pages);
});
