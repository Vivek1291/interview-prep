// Migration v7 → v8: HTTP Fundamentals (45), Validation & Error Handling (46) and Streams & Buffers (47) are added in
// learning order, the API-evolution question joins REST & Auth (03); renamed and private pages are kept.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v8_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const API_Q = 'How do you evolve an API without breaking clients? (compatibility, partial updates, bulk APIs, HATEOAS)';
const NEW_FILES = ['45-http-fundamentals.md', '46-node-validation-errors.md', '47-node-streams-buffers.md'];
const owner = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v7 database: no files 45-47 and no API-evolution question; REST & Auth was the first child of Common
  const files = loadContent().filter((f) => !NEW_FILES.includes(f.file))
    .map((f) => ({ ...f, questions: f.questions.filter((q) => q.title !== API_Q) }));
  const nodes = defaultNodes(files);
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.key === 'backend/common/rest-auth' ? 0 : n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  await Question.create({ section: ids.get('backend/common/rest-auth'), owner, title: 'My REST notes', priority: 2, order: 0 });
  await Question.updateOne({ section: ids.get('backend/common/rest-auth'), title: 'PUT vs PATCH' }, { $set: { title: 'PUT vs PATCH (renamed by the admin)' } });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 7 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v8 adds HTTP, validation/errors and streams sections in learning order', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const kids = async (key) => Section.find({ parent: (await Section.findOne({ key }))._id }).sort({ order: 1 }).lean();
  const v8Keys = ['backend/nodejs/core', 'backend/nodejs/runtime', 'backend/nodejs/modules', 'backend/nodejs/streams', 'backend/nodejs/express', 'backend/nodejs/validation-errors'];
  assert.deepEqual((await kids('backend/nodejs')).map((n) => n.key).filter((k) => v8Keys.includes(k)), v8Keys, 'relative learning order (later versions add more children)');
  const common = await kids('backend/common');
  assert.deepEqual(common.slice(0, 2).map((n) => n.key), ['backend/common/http-fundamentals', 'backend/common/rest-auth']);
  assert.equal(await Question.countDocuments({ section: common[0]._id, owner: null }), 5);

  const rest = await Question.find({ section: common[1]._id, owner: null }).sort({ order: 1 }).lean();
  const at = rest.findIndex((q) => q.title === API_Q);
  assert.equal(rest[at - 1].title, 'How do you design a good API response?', 'API question placed in learning order');
  assert.equal(await Question.countDocuments({ title: 'PUT vs PATCH' }), 0, 'a page the admin renamed is not added back');
  assert.ok(await Question.findOne({ title: 'My REST notes', owner }), 'private page kept');
});

test('running v8 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 7 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
