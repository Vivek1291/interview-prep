// Migration v12 → v13: three new Node.js categories (56-58) and a content fix that replaces req.on('close') with
// res.on('close') in already-seeded examples, without touching pages where an admin changed that snippet.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v13_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT, V13_PATCHES } = require('../src/seed/migrate');
const { inline } = require('../src/seed/markdown');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_FILES = ['56-node-concurrency.md', '57-node-performance.md', '58-node-architecture.md'];
const owner = new mongoose.Types.ObjectId();
let editedId;

// turn current content back into the v12 version of the patched snippets
const unpatch = (content) => V13_PATCHES.reduce((c, p) => c.split(p.to).join(p.from).split(inline(p.to)).join(inline(p.from)), content);

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
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, blocks: q.blocks.map((b) => ({ ...b, content: unpatch(b.content) })), section: idOf.get(n.key), owner: null, order: i })));
  }
  // an admin rewrote the SSE endpoint example in their own way: must stay untouched
  const sse = await Question.findOne({ title: /Server-Sent Events \(SSE\)/, owner: null });
  const blocks = sse.blocks.map((b) => (b.content.includes("req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });") ? { ...b.toObject(), content: '// admin version\nreq.socket.on(\'end\', cleanup);' } : b.toObject()));
  await Question.updateOne({ _id: sse._id }, { $set: { blocks } });
  editedId = sse._id;
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 12 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v13 adds three Node.js categories in order', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const kids = await Section.find({ parent: (await Section.findOne({ key: 'backend/nodejs' }))._id }).sort({ order: 1 }).lean();
  assert.deepEqual(kids.slice(-4).map((n) => n.key), ['backend/nodejs/realtime', 'backend/nodejs/concurrency', 'backend/nodejs/performance', 'backend/nodejs/architecture']);
  for (const [i, n] of [[1, 6], [2, 4], [3, 7]]) assert.equal(await Question.countDocuments({ section: kids.at(-4 + i)._id, owner: null }), n);
});

test("v13 replaces req.on('close') in seeded examples but not in an admin-edited block", async () => {
  const stale = await Question.find({ owner: null, blocks: { $elemMatch: { type: 'code', content: { $regex: "req\\.on\\('close'" } } } }, 'title').lean();
  assert.deepEqual(stale.map((q) => q.title), [], 'no seeded code example still uses req.on(close)');
  const steps = await Question.findOne({ owner: null, title: /Server-Sent Events \(SSE\)/ }).lean();
  assert.ok(steps.blocks.some((b) => b.type === 'text' && b.content.includes("<code>res.on('close')</code> (client gone) unsubscribes")), 'text (HTML) block patched too');
  const sse = await Question.findById(editedId).lean();
  assert.ok(sse.blocks.some((b) => b.content.includes('// admin version')), 'admin edit kept');
  const exportPage = await Question.findOne({ owner: null, title: /stream a large HTTP response/ }).lean();
  assert.ok(exportPage.blocks.some((b) => b.content.includes("res.on('close', () => { if (!res.writableEnded) ac.abort(); });")), 'export example patched');
});

test('running v13 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 12 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
