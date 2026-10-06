// Migration v6 → v7: Node.js Runtime & Modules (43) and Core Modules (44) are added as Node.js children in
// learning order, and the output-puzzle question joins Node core (01); private content is kept.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v7_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const Term = require('../src/models/Term');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const PUZZLE = 'Predict the output: Node.js event loop puzzles (nextTick, Promise, setTimeout, setImmediate)';
const NEW_FILES = ['43-node-runtime.md', '44-node-core-modules.md'];
const owner = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v6 database: no files 43/44 and no puzzle question; express sits right after core
  const files = loadContent().filter((f) => !NEW_FILES.includes(f.file))
    .map((f) => ({ ...f, questions: f.questions.filter((q) => q.title !== PUZZLE) }));
  const nodes = defaultNodes(files);
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  await Question.create({ section: ids.get('backend/nodejs/core'), owner, title: 'My event loop notes', priority: 2, order: 0 });
  await Question.updateOne({ section: ids.get('backend/nodejs/core'), title: 'What are Buffers?' }, { $set: { title: 'Buffers (renamed by the admin)' } });
  await insertDefaultTerms();
  await Term.deleteMany({ term: { $in: ['HMAC', 'Semver', 'Path traversal'] } });
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 6 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v7 adds the Node.js runtime and core-modules sections in learning order', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const node = await Section.findOne({ key: 'backend/nodejs' }).lean();
  const children = await Section.find({ parent: node._id }).sort({ order: 1 }).lean();
  assert.deepEqual(children.map((n) => n.key), ['backend/nodejs/core', 'backend/nodejs/runtime', 'backend/nodejs/modules', 'backend/nodejs/express']);
  assert.equal(children[1].title, 'Node.js Runtime & Modules');
  assert.equal(await Question.countDocuments({ section: children[1]._id, owner: null }), 7);
  assert.equal(await Question.countDocuments({ section: children[2]._id, owner: null }), 5);

  const core = await Question.find({ section: children[0]._id, owner: null }).sort({ order: 1 }).lean();
  const at = core.findIndex((q) => q.title === PUZZLE);
  assert.equal(core[at - 1].title, 'Difference between process.nextTick(), setImmediate() and setTimeout()', 'puzzle placed after nextTick, not at the end');
  assert.ok(await Question.findOne({ title: 'My event loop notes', owner }), 'private page kept');
  assert.equal(await Question.countDocuments({ title: 'What are Buffers?' }), 0, 'a page the admin renamed is not added back');
  assert.equal(await Term.countDocuments({ term: { $in: ['HMAC', 'Semver', 'Path traversal'] } }), 3);
});

test('running v7 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 6 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
