// Migration v14 → v15: System design. Common Topics (empty placeholder) gets 64-67 as child categories, keeping its id and
// private pages; Node.js system designs get the two case-study files 68 and 69 after the existing LLD file.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v15_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT, V15_FILES } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const owner = new mongoose.Types.ObjectId();
let commonId;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v14 database: no files 64-69; System Design → Common Topics is an empty titled placeholder
  const nodes = defaultNodes(loadContent().filter((f) => !V15_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  if (!(await Section.exists({ key: 'system-design/common' }))) {
    await Section.create({ key: 'system-design/common', owner: null, parent: ids.get('system-design'), title: 'Common Topics', icon: '🧭', color: '#6366f1', order: 3 });
  }
  commonId = (await Section.findOne({ key: 'system-design/common' }))._id;
  await Question.create({ section: commonId, owner, title: 'My system design notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 14 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v15 adds the system design categories in learning order', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const common = await Section.findOne({ key: 'system-design/common' }).lean();
  assert.equal(String(common._id), String(commonId), 'placeholder keeps its id');
  assert.ok(await Question.findOne({ section: commonId, title: 'My system design notes', owner }), 'private page kept');
  const kids = async (key) => Section.find({ parent: (await Section.findOne({ key }))._id }).sort({ order: 1 }).lean();
  assert.deepEqual((await kids('system-design/common')).map((n) => n.title),
    ['Scalability & Production Architecture', 'Distributed Systems Fundamentals', 'Resilience & Rate Limiting', 'Microservices Architecture']);
  const node = (await kids('system-design/backend/nodejs')).map((n) => n.title);
  assert.deepEqual(node.slice(-2), ['System Design: Real-Time & Scheduling (Node.js)', 'System Design: Platform & Data (Node.js)'], 'case studies after the existing LLD section');
  for (const [key, n] of [['system-design/common/scalability', 5], ['system-design/common/distributed-systems', 4], ['system-design/common/resilience', 4],
    ['system-design/common/microservices', 4], ['system-design/backend/nodejs/nodejs-system-designs', 3], ['system-design/backend/nodejs/platform-system-designs', 3]]) {
    assert.equal(await Question.countDocuments({ section: (await Section.findOne({ key }))._id, owner: null }), n, key);
  }
});

test('running v15 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  const sections = await Section.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 14 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
  assert.equal(await Section.countDocuments(), sections);
});
