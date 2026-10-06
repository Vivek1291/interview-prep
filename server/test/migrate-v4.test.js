// Migration v3 → v4: the JavaScript sections (files 27-33) are added to an existing database
// without touching what is already there (placeholders, renamed categories, users' private pages).
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v4_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, V4_FILES, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const owner = new mongoose.Types.ObjectId();
let expectedNewPages = 0;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();

  // Build a v3 database: everything except the v4 files, with the old titled placeholders
  const all = loadContent();
  expectedNewPages = all.filter((f) => V4_FILES.includes(f.file)).reduce((n, f) => n + f.questions.length, 0);
  const nodes = defaultNodes(all.filter((f) => !V4_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  const js = ids.get('frontend/javascript');
  const asyncId = new mongoose.Types.ObjectId();
  await Section.insertMany([
    { _id: asyncId, key: 'frontend/javascript/async', owner: null, parent: js, title: 'Async JavaScript', icon: '⏳', color: '#eab308', order: 1 },
    { key: 'frontend/javascript/browser', owner: null, parent: js, title: 'DOM & Browser APIs', icon: '🌐', color: '#eab308', order: 3 },
  ]);
  await Section.updateOne({ key: 'frontend/javascript/core' }, { $set: { title: 'My JS Core' } });            // admin rename
  await Question.create({ section: asyncId, owner, title: 'My event loop notes', priority: 2, order: 0 });   // a user's private page
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 3 } }, { upsert: true });
  await migrate();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const byKey = async (key) => Section.findOne({ key }).lean();

test('v4 adds the JavaScript sections and keeps existing content', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const core = await byKey('frontend/javascript/core');
  assert.equal(core.title, 'My JS Core', 'the admin rename is kept');
  const coreChildren = await Section.find({ parent: core._id }).sort({ order: 1 }).lean();
  assert.deepEqual(coreChildren.map((n) => n.title), ['JS Basics', 'JS Functions & Scope', 'JS Objects & Prototypes']);

  const asyncNode = await byKey('frontend/javascript/async');
  assert.equal(asyncNode.title, 'JS Async & Event Loop', 'the empty placeholder now holds its content file');
  assert.equal(asyncNode.seedFile, '30-js-async.md');
  const asyncPages = await Question.find({ section: asyncNode._id }).lean();
  assert.ok(asyncPages.some((p) => p.title === 'My event loop notes' && String(p.owner) === String(owner)), 'private page kept');
  assert.equal(asyncPages.filter((p) => p.owner === null).length, 7);

  assert.equal((await byKey('frontend/javascript/browser')).title, 'Browser & DOM');
  assert.ok(await byKey('frontend/javascript/patterns'), 'design patterns category created');
  assert.ok(await byKey('frontend/javascript/polyfills/js-polyfills'), 'second polyfills file sits next to the first');

  const shared = await Question.countDocuments({ owner: null, section: { $in: (await Section.find({ seedFile: { $in: V4_FILES } }, '_id').lean()).map((s) => s._id) } });
  assert.equal(shared, expectedNewPages, 'every page of the new files was added once');
});

test('running the migration again changes nothing', async () => {
  const sections = await Section.countDocuments();
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 3 } });          // even if v4 runs twice
  await migrate();
  assert.equal(await Section.countDocuments(), sections);
  assert.equal(await Question.countDocuments(), pages);
});
