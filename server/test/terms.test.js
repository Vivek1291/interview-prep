// Glossary terms + the v3 migration (adds new default content without touching existing content).
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
process.env.MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_terms_test');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate, V3_FILES, CURRENT } = require('../src/seed/migrate');
const { loadTerms } = require('../src/seed');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const Term = require('../src/models/Term');
const Meta = require('../src/models/Meta');

async function signUp(name, email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  const call = (method, url) => agent[method](url).set('Authorization', `Bearer ${res.body.accessToken}`);
  return { user: res.body.user, get: (u) => call('get', u), post: (u) => call('post', u), put: (u) => call('put', u), del: (u) => call('delete', u) };
}

let admin;
let learner;
const block = (content) => ({ id: `b${Math.random()}`, type: 'text', title: '', content });

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
  admin = await signUp('Admin', 'admin@example.com');
  learner = await signUp('Lee', 'lee@example.com');
});
after(() => mongoose.disconnect());

test('a fresh install has the default glossary, libuv included', async () => {
  const list = (await learner.get('/api/terms').expect(200)).body.data;
  assert.equal(list.length, loadTerms().length);
  const libuv = list.find((t) => t.term === 'libuv');
  assert.ok(libuv, 'libuv is a default term');
  assert.match(libuv.summary, /event loop/);
  assert.equal(libuv.canEdit, false, 'learners cannot edit shared terms');
  assert.equal(libuv.blocks, undefined, 'the list is light (no blocks)');
  const full = (await learner.get(`/api/terms/${libuv._id}`).expect(200)).body.data;
  assert.ok(full.blocks.some((b) => b.type === 'diagram') && full.blocks.some((b) => b.type === 'image') && full.blocks.some((b) => b.type === 'chart'));
  assert.deepEqual(list.map((t) => t.term), [...list.map((t) => t.term)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), 'sorted A→Z, case-insensitive');
});

test('shared and private terms follow the same rules as pages', async () => {
  const shared = (await admin.post('/api/terms').send({ term: 'Event emitter', aliases: ['EventEmitter', 'event emitter', 'EventEmitter', ' '], summary: 'on/emit pattern', blocks: [block('<p>pub/sub</p>')] }).expect(201)).body.data;
  assert.equal(shared.owner, null);
  assert.deepEqual(shared.aliases, ['EventEmitter'], 'aliases trimmed, de-duplicated, never equal to the term');
  await admin.post('/api/terms').send({ term: 'event EMITTER' }).expect(409);

  await learner.put(`/api/terms/${shared._id}`).send({ summary: 'hacked' }).expect(403);
  await learner.del(`/api/terms/${shared._id}`).expect(403);

  // a learner may write a private note on the same term
  const mine = (await learner.post('/api/terms').send({ term: 'Event emitter', summary: 'my words' }).expect(201)).body.data;
  assert.equal(String(mine.owner), String(learner.user._id));
  await learner.post('/api/terms').send({ term: 'event emitter' }).expect(409);
  assert.equal((await admin.get('/api/terms').expect(200)).body.data.filter((t) => t.term === 'Event emitter').length, 1, 'admin does not see the private one');
  await admin.get(`/api/terms/${mine._id}`).expect(404);

  const renamed = (await learner.put(`/api/terms/${mine._id}`).send({ term: 'Emitter', aliases: ['Emitter', 'emit'] }).expect(200)).body.data;
  assert.deepEqual([renamed.term, renamed.aliases], ['Emitter', ['emit']]);
  await learner.put(`/api/terms/${mine._id}`).send({ term: '' }).expect(400);
  await learner.post('/api/terms').send({ term: 'x', unknown: 1 }).expect(400);
  await learner.del(`/api/terms/${mine._id}`).expect(200);
  await learner.get(`/api/terms/${mine._id}`).expect(404);
  await request(app).get('/api/terms').expect(401);
});

test('backup and reset include the shared terms; private terms survive a reset', async () => {
  const priv = (await learner.post('/api/terms').send({ term: 'My private term' }).expect(201)).body.data;
  const before = (await admin.get('/api/terms').expect(200)).body.data;
  const libuvId = before.find((t) => t.term === 'libuv')._id;
  const exported = (await admin.get('/api/backup/export').expect(200)).body;
  assert.ok(exported.terms.some((t) => t.term === 'Event emitter'));
  await admin.put(`/api/terms/${libuvId}`).send({ summary: 'edited' }).expect(200);

  await admin.post('/api/backup/reset').expect(200);
  const after = (await admin.get('/api/terms').expect(200)).body.data;
  assert.equal(after.find((t) => t.term === 'libuv')._id, libuvId, 'default terms keep their id');
  assert.match(after.find((t) => t.term === 'libuv').summary, /event loop/, 'reset restores the default text');
  assert.ok(!after.some((t) => t.term === 'Event emitter'), 'admin-added shared terms are removed by a reset');
  assert.ok((await learner.get('/api/terms').expect(200)).body.data.some((t) => String(t._id) === String(priv._id)), 'private term kept');

  await admin.post('/api/backup/import').send(exported).expect(200);
  assert.ok((await admin.get('/api/terms').expect(200)).body.data.some((t) => t.term === 'Event emitter'), 'import restores shared terms');
  // an old backup without terms keeps the current terms
  await admin.post('/api/backup/import').send({ sections: exported.sections, questions: exported.questions }).expect(200);
  assert.ok((await admin.get('/api/terms').expect(200)).body.data.some((t) => t.term === 'Event emitter'));
});

test('v3 migration adds the React sections and terms to an existing database without changing anything', async () => {
  // Make the database look like v2: React categories were empty placeholders, no terms,
  // an admin edited a page, deleted a placeholder and added a page to a React placeholder.
  const reactKeys = ['frontend/react/fundamentals', 'frontend/react/hooks', 'frontend/react/performance'];
  const reactNodes = await Section.find({ key: { $in: reactKeys } }).lean();
  await Question.deleteMany({ section: { $in: reactNodes.map((n) => n._id) }, owner: null });
  await Section.updateMany({ key: { $in: reactKeys } }, { $set: { seedFile: null } });
  await Section.updateOne({ key: 'frontend/react/fundamentals' }, { $set: { title: 'Fundamentals' } });
  await Section.updateOne({ key: 'frontend/react/hooks' }, { $set: { title: 'My Hooks' } });   // renamed by the admin
  await Section.deleteMany({ key: { $in: ['frontend/react/suspense', 'frontend/react/react-19', 'testing/backend/java'] } });
  await Term.deleteMany({});
  const fundamentals = reactNodes.find((n) => n.key === 'frontend/react/fundamentals');
  await Question.create({ section: fundamentals._id, owner: null, title: 'My own React page', blocks: [], order: 0 });
  const nodePage = await Question.findOne({ owner: null }).sort({ _id: 1 });
  await Question.updateOne({ _id: nodePage._id }, { $set: { title: 'Edited by the admin' } });
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 2 } });
  const pagesBefore = await Question.countDocuments();

  await migrate();

  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const after = new Map((await Section.find({ key: { $ne: null } }).lean()).map((n) => [n.key, n]));
  assert.ok(after.get('frontend/react/suspense') && after.get('frontend/react/react-19'), 'new React categories created');
  assert.equal(String(after.get('frontend/react/suspense').parent), String(after.get('frontend/react')._id), 'placed under React');
  assert.ok(!after.has('testing/backend/java'), 'a category the admin deleted is NOT re-created');
  assert.equal(after.get('frontend/react/fundamentals').seedFile, '22-react-fundamentals.md');
  assert.notEqual(after.get('frontend/react/fundamentals').title, 'Fundamentals', 'placeholder takes the section title');
  assert.equal((await Question.findById(nodePage._id).lean()).title, 'Edited by the admin', 'existing pages untouched');
  assert.ok(await Question.findOne({ title: 'My own React page' }), 'the admin page in the placeholder is kept');
  const added = (await Question.countDocuments()) - pagesBefore;
  const expected = require('../src/seed').defaultNodes().filter((n) => V3_FILES.includes(n.seedFile)).reduce((s, n) => s + n.questions.length, 0);
  assert.equal(added, expected, 'every page of the React files was added');
  assert.equal(await Term.countDocuments({ owner: null }), loadTerms().length, 'default terms added');

  // running it again changes nothing
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 2 } });
  await migrate();
  assert.equal((await Question.countDocuments()) - pagesBefore, expected, 'idempotent');
  assert.equal(await Term.countDocuments({ owner: null }), loadTerms().length);
});
