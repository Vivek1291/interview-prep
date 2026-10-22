// Migration v13 → v14: DevOps content. Docker (59) fills the Docker placeholder (keeping its id and private pages),
// CI/CD gets GitHub Actions (60) and Jenkins (61), Common Topics gets Observability (62), AWS gets Serverless (63).
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v14_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT, V14_FILES } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const owner = new mongoose.Types.ObjectId();
let dockerId;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v13 database: no files 59-63; Docker, CI/CD and Common Topics are empty titled placeholders under DevOps
  const nodes = defaultNodes(loadContent().filter((f) => !V14_FILES.includes(f.file)));
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  const devops = ids.get('devops');
  for (const [key, title, order] of [['devops/docker', 'Docker', 1], ['devops/ci-cd', 'CI/CD', 3], ['devops/common', 'Common Topics', 5]]) {
    if (!(await Section.exists({ key }))) await Section.create({ key, owner: null, parent: devops, title, icon: '🐳', color: '#0ea5e9', order });
  }
  dockerId = (await Section.findOne({ key: 'devops/docker' }))._id;
  await Question.create({ section: dockerId, owner, title: 'My Docker notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 13 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v14 fills the DevOps placeholders and adds Serverless under AWS', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const docker = await Section.findOne({ key: 'devops/docker' }).lean();
  assert.equal(String(docker._id), String(dockerId), 'placeholder keeps its id');
  assert.equal(docker.title, 'Docker for Node.js');
  assert.equal(await Question.countDocuments({ section: dockerId, owner: null }), 6);
  assert.ok(await Question.findOne({ section: dockerId, title: 'My Docker notes', owner }), 'private page kept');

  const kids = async (key) => Section.find({ parent: (await Section.findOne({ key }))._id }).sort({ order: 1 }).lean();
  assert.deepEqual((await kids('devops/ci-cd')).map((n) => n.title), ['CI/CD with GitHub Actions', 'CI/CD with Jenkins']);
  assert.deepEqual((await kids('devops/common')).map((n) => n.title), ['Logging, Monitoring & Observability']);
  const aws = await kids('devops/aws');
  assert.equal(aws.at(-1).title, 'Serverless & AWS for Node.js', 'serverless comes after the existing AWS sections');
  for (const [key, n] of [['devops/ci-cd/ci-cd-github-actions', 4], ['devops/ci-cd/ci-cd-jenkins', 4], ['devops/common/observability', 5], ['devops/aws/serverless-aws', 4]]) {
    assert.equal(await Question.countDocuments({ section: (await Section.findOne({ key }))._id, owner: null }), n, key);
  }
});

test('running v14 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  const sections = await Section.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 13 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
  assert.equal(await Section.countDocuments(), sections);
});
