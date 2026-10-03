// Integration tests: the real Express app against a real MongoDB (a separate test database).
// Run: MONGO_URI=mongodb://localhost:27017/learning_hub_test npm test
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
process.env.MONGO_URI ||= 'mongodb://localhost:27017/learning_hub_test';
process.env.UPLOAD_DIR ||= require('path').join(require('os').tmpdir(), 'learning-hub-test-uploads');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate } = require('../src/seed/migrate');

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5cf0000000049454e44ae426082', 'hex');

async function signUp(name, email) {
  const agent = request.agent(app);                               // keeps the refresh cookie like a browser
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  const token = res.body.accessToken;
  const call = (method, url) => agent[method](url).set('Authorization', `Bearer ${token}`);
  return { agent, token, user: res.body.user, get: (u) => call('get', u), post: (u) => call('post', u), put: (u) => call('put', u), patch: (u) => call('patch', u), del: (u) => call('delete', u) };
}

let admin, asha, ben;
let tree;
const node = (key) => tree.nodes.find((n) => n.key === key);
const childrenOf = (t, id) => t.nodes.filter((n) => String(n.parent) === String(id)).sort((a, b) => a.order - b.order);

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
  admin = await signUp('Admin', 'admin@example.com');
  asha = await signUp('Asha', 'asha@example.com');
  ben = await signUp('Ben', 'ben@example.com');
  tree = (await admin.get('/api/sections').expect(200)).body.data;
});
after(async () => {
  await mongoose.disconnect();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

test('fresh install seeds the tree in the right shape', async () => {
  const roots = childrenOf(tree, null).map((n) => n.title);
  assert.deepEqual(roots, ['Frontend', 'Backend', 'System Design', 'DevOps', 'Testing', 'DSA']);
  assert.equal(tree.pages.length, 292);
  assert.deepEqual(childrenOf(tree, node('frontend/javascript')._id).map((n) => n.title),
    ['Core Concepts', 'JS Async & Event Loop', 'Polyfills & Implementations', 'Browser & DOM', 'JS Design Patterns']);
  assert.deepEqual(childrenOf(tree, node('frontend/javascript/core')._id).map((n) => n.title), ['JS Basics', 'JS Functions & Scope', 'JS Objects & Prototypes']);
  assert.deepEqual(childrenOf(tree, node('frontend/javascript/polyfills')._id).map((n) => n.title), ['JS Implementations (Polyfills)', 'Array & Function Polyfills']);
  assert.deepEqual(childrenOf(tree, node('frontend/react')._id).map((n) => n.title),
    ['React Fundamentals', 'React Hooks', 'React Performance', 'React Suspense & Concurrent React', 'React 19']);
  assert.deepEqual(childrenOf(tree, node('backend/nodejs')._id).map((n) => n.title), ['Node.js Core', 'Express.js']);
  assert.equal(childrenOf(tree, node('backend/databases/mongodb')._id).length, 4);
  assert.equal(tree.pages.filter((p) => String(p.section) === String(node('frontend/javascript/polyfills/js-implementations')._id)).length, 12);
  assert.equal(childrenOf(tree, node('backend/common')._id)[0].title, 'REST APIs & Authentication', 'a node\'s own files come before its placeholder children');
  assert.ok(node('frontend/nextjs') && node('backend/databases/postgresql') && node('testing/backend/java'), 'placeholders exist');
});

test('the first account is admin, the others are users', () => {
  assert.equal(admin.user.role, 'admin');
  assert.equal(asha.user.role, 'user');
});

test('auth: no token → 401, refresh rotates, reused refresh token ends the session', async () => {
  await request(app).get('/api/sections').expect(401);
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ name: 'Rita', email: 'rita@example.com', password: 'Secret123' }).expect(201);
  const first = await agent.post('/api/auth/refresh').expect(200);
  const oldCookie = first.headers['set-cookie'][0].split(';')[0];
  await agent.post('/api/auth/refresh').expect(200);
  const reuse = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
  assert.equal(reuse.body.code, 'REFRESH_REUSED');
  await agent.post('/api/auth/refresh').expect(401);
  const bad = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-pass' }).expect(401);
  assert.equal(bad.body.message, 'Email or password is wrong');
  await request(app).post('/api/auth/register').send({ name: 'Copy', email: 'ASHA@example.com', password: 'Secret123' }).expect(409);
  const invalid = await request(app).post('/api/auth/register').send({ name: 'X', email: 'nope', password: 'short' }).expect(400);
  assert.deepEqual(invalid.body.details.map((d) => d.path).sort(), ['email', 'name', 'password']);
});

test('only admins edit shared content; users get their own private content inside shared categories', async () => {
  const page = tree.pages[0];
  await asha.put(`/api/questions/${page._id}`).send({ title: 'hacked' }).expect(403);
  await asha.post('/api/sections').send({ title: 'x', owner: null }).expect(400);           // strict schema: no "owner"
  const js = node('frontend/javascript');
  const mine = (await asha.post('/api/sections').send({ title: 'My Polyfills', parent: String(js._id) }).expect(201)).body.data;
  assert.equal(mine.owner, asha.user._id);
  const myPage = (await asha.post('/api/questions').send({ section: mine._id, title: 'call / apply / bind' }).expect(201)).body.data;

  const ashaTree = (await asha.get('/api/sections')).body.data;
  const benTree = (await ben.get('/api/sections')).body.data;
  const adminTree = (await admin.get('/api/sections')).body.data;
  assert.ok(ashaTree.nodes.some((n) => n._id === mine._id));
  assert.ok(!benTree.nodes.some((n) => n._id === mine._id), 'other users cannot see it');
  assert.ok(!adminTree.nodes.some((n) => n._id === mine._id), 'admins cannot see private content either');
  await ben.get(`/api/questions/${myPage._id}`).expect(404);
  await ben.put(`/api/questions/${myPage._id}`).send({ title: 'x' }).expect(404);

  // an admin's new content is shared and cannot be put inside a private category
  await admin.post('/api/sections').send({ title: 'Shared?', parent: mine._id }).expect(404);
  const shared = (await admin.post('/api/sections').send({ title: 'Shared topic', parent: String(js._id) }).expect(201)).body.data;
  assert.equal(shared.owner, null);
  assert.ok((await ben.get('/api/sections')).body.data.nodes.some((n) => n._id === shared._id));
  await ben.put(`/api/sections/${shared._id}`).send({ title: 'nope' }).expect(403);
});

test('moves: no cycles, users can move their own items anywhere they can see', async () => {
  const a = (await asha.post('/api/sections').send({ title: 'A' }).expect(201)).body.data;
  const b = (await asha.post('/api/sections').send({ title: 'B', parent: a._id }).expect(201)).body.data;
  const r = await asha.put(`/api/sections/${a._id}`).send({ parent: b._id }).expect(400);
  assert.match(r.body.message, /inside itself/);
  await asha.put(`/api/sections/${b._id}`).send({ parent: String(node('devops')._id) }).expect(200);
  await asha.patch('/api/sections/reorder').send({ ids: [String(node('frontend')._id), String(node('backend')._id)] }).expect(403);
});

test('progress is per user', async () => {
  const page = tree.pages.find((p) => p.priority === 3);
  await asha.put(`/api/questions/${page._id}/progress`).send({ status: 'confident', starred: true }).expect(200);
  await asha.post(`/api/questions/${page._id}/my-notes`).send({ text: 'my own note' }).expect(201);
  const forAsha = (await asha.get(`/api/questions/${page._id}`)).body.data;
  const forBen = (await ben.get(`/api/questions/${page._id}`)).body.data;
  assert.deepEqual([forAsha.progress.status, forAsha.progress.starred, forAsha.progress.notes.length], ['confident', true, 1]);
  assert.deepEqual([forBen.progress.status, forBen.progress.starred, forBen.progress.notes.length], ['new', false, 0]);
  assert.equal(forAsha.canEdit, false);
  const revise = (await asha.get(`/api/quick-notes?node=${page.section}`)).body.data;
  const item = revise.find((x) => x._id === page._id);
  assert.ok(item.authorNotes.length > 0 && item.myNotes[0].text === 'my own note');
  assert.ok(item.path.length >= 2, 'revise items carry their tree path');
});

test('deleting a shared category keeps users\' private items (recovered)', async () => {
  const shared = (await admin.post('/api/sections').send({ title: 'Temp shared', parent: String(node('devops')._id) }).expect(201)).body.data;
  const sharedPage = (await admin.post('/api/questions').send({ section: shared._id, title: 'Shared page' }).expect(201)).body.data;
  const priv = (await ben.post('/api/sections').send({ title: 'Ben inside', parent: shared._id }).expect(201)).body.data;
  const privPage = (await ben.post('/api/questions').send({ section: shared._id, title: 'Ben page in shared' }).expect(201)).body.data;
  const r = (await admin.del(`/api/sections/${shared._id}`).expect(200)).body.data;
  assert.equal(r.recovered.recoveredPages, 1);
  const benTree = (await ben.get('/api/sections')).body.data;
  assert.equal(benTree.nodes.find((n) => n._id === priv._id).parent, null, 'private category moved to the top level');
  const recovered = benTree.nodes.find((n) => n.title === 'Recovered');
  assert.equal(benTree.pages.find((p) => p._id === privPage._id).section, recovered._id);
  await admin.get(`/api/questions/${sharedPage._id}`).expect(404);
});

test('admin reset keeps page ids, so progress and private sub-items survive', async () => {
  const page = tree.pages.find((p) => p.priority === 3);
  const js = node('frontend/javascript');
  await asha.put(`/api/questions/${page._id}/progress`).send({ status: 'revise' }).expect(200);
  await asha.post('/api/backup/reset').expect(403);
  await admin.post('/api/backup/reset').expect(200);
  const after = (await asha.get(`/api/questions/${page._id}`).expect(200)).body.data;
  assert.equal(after.progress.status, 'revise');
  const ashaTree = (await asha.get('/api/sections')).body.data;
  const mine = ashaTree.nodes.find((n) => n.title === 'My Polyfills');
  assert.equal(mine.parent, String(js._id), 'still attached to the same shared JavaScript node');
});

test('profile, password and avatar', async () => {
  const p = await asha.patch('/api/users/me').send({ name: 'Asha R' }).expect(200);
  assert.equal(p.body.user.name, 'Asha R');
  await asha.patch('/api/users/me').send({ role: 'admin' }).expect(400);
  const up = await asha.post('/api/users/me/avatar').attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' }).expect(200);
  const url = up.body.user.avatarUrl;
  assert.match(url, /^\/uploads\/avatars\/.+\.png$/);
  const file = path.join(process.env.UPLOAD_DIR, 'avatars', path.basename(url));
  assert.ok(fs.existsSync(file));
  const served = await request(app).get(url).expect(200);
  assert.match(served.headers['content-security-policy'], /sandbox/);
  await asha.post('/api/users/me/avatar').attach('avatar', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' }).expect(400);
  await asha.post('/api/users/me/avatar').attach('avatar', Buffer.alloc(3 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' }).expect(400);
  await asha.del('/api/users/me/avatar').expect(200);
  assert.ok(!fs.existsSync(file), 'old avatar file deleted');
  await asha.put('/api/users/me/password').send({ currentPassword: 'wrong', newPassword: 'NewSecret1' }).expect(400);
  const changed = await asha.put('/api/users/me/password').send({ currentPassword: 'Secret123', newPassword: 'NewSecret1' }).expect(200);
  assert.ok(changed.body.accessToken, 'this device gets a new session');
  await asha.agent.post('/api/auth/refresh').expect(200);              // this device's new refresh cookie works
  await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'NewSecret1' }).expect(200);
});

test('admin manages roles; promotions apply immediately', async () => {
  await ben.get('/api/admin/users').expect(403);
  const list = (await admin.get('/api/admin/users').expect(200)).body.data;
  assert.ok(list.every((u) => !('passwordHash' in u)));
  await admin.patch(`/api/admin/users/${ben.user._id}`).send({ role: 'admin' }).expect(200);
  await ben.get('/api/admin/users').expect(200);                 // same access token, new role
  await admin.patch(`/api/admin/users/${ben.user._id}`).send({ role: 'user' }).expect(200);
  await admin.patch(`/api/admin/users/${admin.user._id}`).send({ role: 'user' }).expect(400);   // last admin
});
