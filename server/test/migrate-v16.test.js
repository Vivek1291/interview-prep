// Migration v15 → v16: Nginx & deploying frontend + backend (70) is added under DevOps, right after Docker.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v16_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT, V16_FILES } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v15 database without file 70; DevOps children keep their v15 order values
  const nodes = defaultNodes(loadContent().filter((f) => !V16_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 15 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v16 adds Nginx & deployment right after Docker', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const devops = await Section.findOne({ key: 'devops' });
  const kids = await Section.find({ parent: devops._id, owner: null }).sort({ order: 1 }).lean();
  const keys = kids.map((k) => k.key);
  assert.equal(keys.indexOf('devops/nginx-deployment'), keys.indexOf('devops/docker') + 1, keys.join(', '));
  const nginx = kids.find((k) => k.key === 'devops/nginx-deployment');
  assert.equal(nginx.title, 'Nginx & Deploying Frontend + Backend');
  assert.equal(await Question.countDocuments({ section: nginx._id, owner: null }), 5);
});

test('running v16 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 15 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
