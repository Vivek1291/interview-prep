// Sub-pages: a page can contain pages (e.g. "Implement debounce" → "Debounce with leading edge").
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
process.env.MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_subpages_test');

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { loadSecrets } = require('../src/config/secrets');
const { migrate } = require('../src/seed/migrate');

async function signUp(name, email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' }).expect(201);
  const call = (method, url) => agent[method](url).set('Authorization', `Bearer ${res.body.accessToken}`);
  return { user: res.body.user, get: (u) => call('get', u), post: (u) => call('post', u), put: (u) => call('put', u), patch: (u) => call('patch', u), del: (u) => call('delete', u) };
}

let admin;
let learner;
let debounce;
let tree;
const pageByTitle = (t, title) => t.pages.find((p) => p.title === title);

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  await loadSecrets();
  await migrate();
  admin = await signUp('Admin', 'admin@example.com');
  learner = await signUp('Lee', 'lee@example.com');
  tree = (await learner.get('/api/sections').expect(200)).body.data;
  debounce = pageByTitle(tree, 'Implement debounce');
});
after(() => mongoose.disconnect());

test('a learner adds private sub-pages (any depth) under a shared page', async () => {
  const leading = (await learner.post('/api/questions').send({ parent: debounce._id, title: 'Debounce with leading edge' }).expect(201)).body.data;
  assert.equal(String(leading.parent), String(debounce._id));
  assert.equal(String(leading.section), String(debounce.section), 'a sub-page lives in its parent\'s category');
  assert.equal(String(leading.owner), String(learner.user._id), 'private');
  const deeper = (await learner.post('/api/questions').send({ parent: leading._id, title: 'Leading + trailing (lodash options)' }).expect(201)).body.data;
  const second = (await learner.post('/api/questions').send({ parent: debounce._id, title: 'useDebounce hook' }).expect(201)).body.data;
  assert.equal(second.order, leading.order + 1, 'ordered among siblings');

  const t = (await learner.get('/api/sections').expect(200)).body.data;
  assert.equal(String(pageByTitle(t, 'Leading + trailing (lodash options)').parent), String(leading._id), 'tree pages carry their parent');
  assert.ok(!(await admin.get('/api/sections').expect(200)).body.data.pages.some((p) => p.title === 'Debounce with leading edge'), 'admin cannot see them');
  await admin.post('/api/questions').send({ parent: leading._id, title: 'nope' }).expect(404);    // can't place under a page you can't see
  await learner.post('/api/questions').send({ title: 'no place' }).expect(400);                  // section or parent required
  // shared content can't live under private content
  const mine = (await learner.post('/api/questions').send({ section: debounce.section, title: 'My page' }).expect(201)).body.data;
  await admin.post('/api/questions').send({ parent: mine._id, title: 'x' }).expect(404);
  // admins add shared sub-pages for everyone
  const shared = (await admin.post('/api/questions').send({ parent: debounce._id, title: 'Debounce vs throttle (shared)' }).expect(201)).body.data;
  assert.equal(shared.owner, null);
  assert.ok((await learner.get('/api/sections').expect(200)).body.data.pages.some((p) => p._id === shared._id));
  await learner.put(`/api/questions/${shared._id}`).send({ title: 'hack' }).expect(403);
  void deeper;
});

test('moving: no cycles, moving to another category takes the sub-pages along', async () => {
  const t = (await learner.get('/api/sections').expect(200)).body.data;
  const leading = pageByTitle(t, 'Debounce with leading edge');
  const deeper = pageByTitle(t, 'Leading + trailing (lodash options)');
  const hook = pageByTitle(t, 'useDebounce hook');
  await learner.put(`/api/questions/${leading._id}`).send({ parent: deeper._id }).expect(400);    // inside itself
  await learner.put(`/api/questions/${leading._id}`).send({ parent: leading._id }).expect(400);

  // re-parent under a sibling
  const moved = (await learner.put(`/api/questions/${hook._id}`).send({ parent: leading._id }).expect(200)).body.data;
  assert.equal(String(moved.parent), String(leading._id));
  // reorder siblings under the same parent
  await learner.patch('/api/questions/reorder').send({ ids: [hook._id, deeper._id] }).expect(200);
  await learner.patch('/api/questions/reorder').send({ ids: [hook._id, debounce._id] }).expect(400);   // not siblings

  // move the sub-page tree to my own category
  const cat = (await learner.post('/api/sections').send({ title: 'My debounce notes' }).expect(201)).body.data;
  const top = (await learner.put(`/api/questions/${leading._id}`).send({ section: cat._id }).expect(200)).body.data;
  assert.equal(top.parent, null, 'leaving the category detaches it from its parent page');
  const after = (await learner.get('/api/sections').expect(200)).body.data;
  for (const title of ['Leading + trailing (lodash options)', 'useDebounce hook']) {
    const p = pageByTitle(after, title);
    assert.equal(String(p.section), String(cat._id), `${title} moved with its parent`);
    assert.equal(String(p.parent), String(leading._id), `${title} still under its parent`);
  }
  // back under the shared page: the whole sub-tree comes back
  await learner.put(`/api/questions/${leading._id}`).send({ parent: debounce._id }).expect(200);
  const back = (await learner.get('/api/sections').expect(200)).body.data;
  assert.ok(['Leading + trailing (lodash options)', 'useDebounce hook'].every((x) => String(pageByTitle(back, x).section) === String(debounce.section)));
});

test('deleting a page: own sub-pages go too, other users\' private sub-pages are kept', async () => {
  // admin deletes the shared "Implement debounce" page
  const res = await admin.del(`/api/questions/${debounce._id}`).expect(204);
  void res;
  const t = (await learner.get('/api/sections').expect(200)).body.data;
  assert.ok(!t.pages.some((p) => p.title === 'Implement debounce'));
  assert.ok(!t.pages.some((p) => p.title === 'Debounce vs throttle (shared)'), 'the admin\'s shared sub-page was deleted with it');
  const leading = pageByTitle(t, 'Debounce with leading edge');
  assert.ok(leading, 'learner\'s private sub-page rescued');
  assert.equal(leading.parent, null, '…as a top-level page');
  assert.equal(String(leading.section), String(debounce.section), '…in the same category');
  assert.equal(String(pageByTitle(t, 'Leading + trailing (lodash options)').parent), String(leading._id), 'its own sub-pages stay under it');

  // the learner deletes their page: their sub-pages go too
  await learner.del(`/api/questions/${leading._id}`).expect(204);
  const t2 = (await learner.get('/api/sections').expect(200)).body.data;
  assert.ok(!t2.pages.some((p) => ['Debounce with leading edge', 'Leading + trailing (lodash options)', 'useDebounce hook'].includes(p.title)));
});
