// Migration v11 → v12: the Messaging & Queues placeholder gets two child categories (files 54 and 55)
// and keeps its id and private pages.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v12_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_FILES = ['54-messaging-queues.md', '55-background-jobs.md'];
const owner = new mongoose.Types.ObjectId();
let messagingId;

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
  messagingId = idOf.get('backend/common/messaging');
  await Question.create({ section: messagingId, owner, title: 'My queue notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 11 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v12 adds two child categories under Messaging & Queues', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const kids = await Section.find({ parent: messagingId }).sort({ order: 1 }).lean();
  assert.deepEqual(kids.map((k) => k.seedFile), NEW_FILES);
  assert.equal(await Question.countDocuments({ section: kids[0]._id, owner: null }), 6);
  assert.equal(await Question.countDocuments({ section: kids[1]._id, owner: null }), 4);
  assert.ok(await Question.findOne({ section: messagingId, title: 'My queue notes', owner }), 'private page kept');
});

test('running v12 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 11 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
