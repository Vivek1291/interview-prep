// Migration v9 → v10: Real-Time: WebSockets & SSE (51) is added under Node.js after Database Integration.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v10_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_FILES = ['51-realtime.md'];
const owner = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  const nodes = defaultNodes(loadContent().filter((f) => !NEW_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  await Question.create({ section: ids.get('backend/nodejs/database'), owner, title: 'My DB notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 9 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v10 adds the real-time section after database integration', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const kids = await Section.find({ parent: (await Section.findOne({ key: 'backend/nodejs' }))._id }).sort({ order: 1 }).lean();
  const keys = kids.map((n) => n.key);
  assert.equal(keys.indexOf('backend/nodejs/realtime'), keys.indexOf('backend/nodejs/database') + 1, 'realtime right after database');
  const rt = kids.find((n) => n.key === 'backend/nodejs/realtime');
  assert.equal(rt.title, 'Real-Time: WebSockets & SSE');
  assert.equal(await Question.countDocuments({ section: rt._id, owner: null }), 8);
  assert.ok(await Question.findOne({ title: 'My DB notes', owner }), 'private page kept');
});

test('running v10 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 9 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
