// Migration v5 → v6: Web Security (file 42) and new questions in existing sections (31, 34, 35) are added
// and put in learning order; private content and admin pages are kept.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v6_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_IN_EXISTING = ['What happens after layout? Paint, rasterization and compositing (CPU vs GPU)', 'How does the browser produce frames? (vsync, the 16.7 ms budget, dropped frames)',
  'How does the TypeScript compiler work? (scanner, parser, AST, checker, emitter)', 'How do you type API calls end to end? (typed fetch, typed errors, Zod validation)'];
const owner = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v5 database: no file 42, and some of the new questions missing from 31/34/35
  const files = loadContent().filter((f) => f.file !== '42-web-security.md')
    .map((f) => ({ ...f, questions: f.questions.filter((q) => !NEW_IN_EXISTING.includes(q.title)) }));
  const nodes = defaultNodes(files);
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.key === 'frontend/html-css' ? 4 : n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  await Question.create({ section: ids.get('frontend/javascript/browser'), owner, title: 'My rendering notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 5 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v6 adds Web Security and the new questions in learning order', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const sec = await Section.findOne({ key: 'frontend/security' }).lean();
  assert.equal(sec.title, 'Web Security (Browser)');
  assert.equal(await Question.countDocuments({ section: sec._id, owner: null }), 7);
  const frontend = await Section.find({ parent: (await Section.findOne({ key: 'frontend' }))._id }).sort({ order: 1 }).lean();
  assert.deepEqual(frontend.slice(-2).map((n) => n.key), ['frontend/security', 'frontend/html-css']);

  const browser = await Section.findOne({ key: 'frontend/javascript/browser' }).lean();
  const pages = await Question.find({ section: browser._id, owner: null }).sort({ order: 1 }).lean();
  assert.equal(pages.length, 16);
  assert.equal(pages[2].title, NEW_IN_EXISTING[0], 'new question placed after reflow, not at the end');
  assert.ok(await Question.findOne({ title: 'My rendering notes', owner }), 'private page kept');
  const ts = await Question.find({ section: (await Section.findOne({ key: 'frontend/typescript/typescript-fundamentals' }))._id, owner: null }).sort({ order: 1 }).lean();
  assert.equal(ts[1].title, NEW_IN_EXISTING[2]);
});

test('running v6 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 5 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
