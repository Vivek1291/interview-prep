// Migration test: old flat data (v1 backup format) → tree (v2), keeping ids, edits and progress.
// Uses a real v1 backup when BACKUP_FILE is set (e.g. the owner's export); otherwise the seed content in v1 shape.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate } = require('../src/seed/migrate');
const { loadContent } = require('../src/seed');

let v1;
before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  if (process.env.BACKUP_FILE) {
    v1 = JSON.parse(fs.readFileSync(process.env.BACKUP_FILE, 'utf8'));
  } else {
    const files = loadContent();
    v1 = { sections: [], questions: [] };
    files.forEach((f, i) => {
      const id = new mongoose.Types.ObjectId();
      v1.sections.push({ _id: id, ...f.section, order: i });
      f.questions.forEach((q, j) => v1.questions.push({ ...q, _id: new mongoose.Types.ObjectId(), section: id, order: j, status: 'new', starred: false }));
    });
  }
  // Old-format edits the owner might have made
  v1.questions[0].status = 'confident';
  v1.questions[1].status = 'revise';
  v1.questions[2].starred = true;
  v1.questions[3].title = `${v1.questions[3].title} (edited)`;
  const custom = { _id: new mongoose.Types.ObjectId(), title: 'My Custom Section', icon: '⭐', color: '#000000', description: '', order: 99 };
  v1.sections.push(custom);
  v1.questions.push({ _id: new mongoose.Types.ObjectId(), section: custom._id, title: 'My own question', priority: 2, tags: [], status: 'learning', starred: false, order: 0, blocks: [], quickNotes: [] });

  const db = mongoose.connection.db;
  const asIds = (d) => ({ ...d, _id: new mongoose.Types.ObjectId(String(d._id)), ...(d.section ? { section: new mongoose.Types.ObjectId(String(d.section)) } : {}) });
  await db.collection('sections').insertMany(v1.sections.map(asIds));
  await db.collection('questions').insertMany(v1.questions.map(asIds));
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('old sections are placed into the tree with their ids, pages and edits intact', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({ name: 'Owner', email: 'owner@example.com', password: 'Secret123' }).expect(201);
  assert.equal(reg.body.user.role, 'admin');
  const auth = (r) => r.set('Authorization', `Bearer ${reg.body.accessToken}`);
  const tree = (await auth(agent.get('/api/sections')).expect(200)).body.data;

  assert.equal(tree.pages.length, v1.questions.length, 'no page lost');
  for (const s of v1.sections) assert.ok(tree.nodes.some((n) => n._id === String(s._id)), `section kept: ${s.title}`);
  const byId = new Map(tree.nodes.map((n) => [n._id, n]));
  const pathOf = (id) => { const out = []; for (let n = byId.get(id); n; n = n.parent ? byId.get(n.parent) : null) out.unshift(n.title); return out.join(' › '); };
  const where = (title) => pathOf(tree.nodes.find((n) => n.title === title)._id);
  assert.equal(where('Node.js Core'), 'Backend › Node.js › Node.js Core');
  assert.equal(where('Mongoose'), 'Backend › Databases › MongoDB › Mongoose');
  assert.equal(where('AWS S3'), 'DevOps › AWS › AWS S3');
  assert.equal(where('Frontend LLD'), 'System Design › Frontend › React › Frontend LLD');
  assert.match(where('JS Implementations (Polyfills)'), /^Frontend › JavaScript › Polyfills & Implementations › /);
  assert.equal(where('My Custom Section'), 'Uncategorised › My Custom Section');
  assert.ok(tree.pages.some((p) => p.title.endsWith('(edited)')), 'page edits kept');

  // progress stash claimed by the first admin
  const status = new Map(tree.pages.map((p) => [p._id, p]));
  assert.equal(status.get(String(v1.questions[0]._id)).status, 'confident');
  assert.equal(status.get(String(v1.questions[1]._id)).status, 'revise');
  assert.equal(status.get(String(v1.questions[2]._id)).starred, true);
  assert.equal(status.get(String(v1.questions.at(-1)._id)).status, 'learning');

  // a second user starts fresh
  const other = await request(app).post('/api/auth/register').send({ name: 'Learner', email: 'l@example.com', password: 'Secret123' }).expect(201);
  const theirs = (await request(app).get('/api/sections').set('Authorization', `Bearer ${other.body.accessToken}`)).body.data;
  assert.ok(theirs.pages.every((p) => p.status === 'new' && !p.starred));

  // old fields are gone from the pages
  const raw = await mongoose.connection.db.collection('questions').findOne({ _id: new mongoose.Types.ObjectId(String(v1.questions[0]._id)) });
  assert.equal(raw.status, undefined);
  assert.equal(raw.owner, null);
});

test('running the migration again changes nothing', async () => {
  const before = await mongoose.connection.db.collection('sections').countDocuments();
  await migrate();
  assert.equal(await mongoose.connection.db.collection('sections').countDocuments(), before);
});
