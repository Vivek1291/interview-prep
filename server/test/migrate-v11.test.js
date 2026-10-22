// Migration v10 → v11: Redis (52) and Caching (53) fill the existing Redis and Caching placeholders,
// keeping their ids and private pages.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v11_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_FILES = ['52-redis.md', '53-caching.md'];
const owner = new mongoose.Types.ObjectId();
const ids = {};

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  const nodes = defaultNodes(loadContent().filter((f) => !NEW_FILES.includes(f.file)));
  const idOf = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: idOf.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? idOf.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: idOf.get(n.key), owner: null, order: i })));
  }
  for (const [key, parent, title, order] of [['backend/databases/redis', 'backend/databases', 'Redis', 3], ['backend/common/caching', 'backend/common', 'Caching', 2]]) {
    if (!(await Section.exists({ key }))) await Section.create({ key, owner: null, parent: idOf.get(parent), title, icon: '🗃️', color: '#8b5cf6', order });
    ids[key] = (await Section.findOne({ key }))._id;
  }
  await Question.create({ section: ids['backend/common/caching'], owner, title: 'My caching notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 10 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v11 fills the Redis and Caching placeholders', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const redis = await Section.findById(ids['backend/databases/redis']).lean();
  const caching = await Section.findById(ids['backend/common/caching']).lean();
  assert.equal(redis.seedFile, '52-redis.md');
  assert.equal(caching.seedFile, '53-caching.md');
  assert.equal(await Question.countDocuments({ section: redis._id, owner: null }), 6);
  assert.equal(await Question.countDocuments({ section: caching._id, owner: null }), 5);
  assert.ok(await Question.findOne({ section: caching._id, title: 'My caching notes', owner }), 'private page kept');
});

test('running v11 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 10 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
