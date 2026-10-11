// Migration v8 → v9: Node.js Database Integration (48) is added under Node.js, and SQL Fundamentals (49) and PostgreSQL (50)
// fill the existing SQL/PostgreSQL placeholders, which keep their ids and any private pages.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT = 'off';
const MONGO_URI = (process.env.MONGO_URI || 'mongodb://localhost:27017/learning_hub_test').replace(/\/[^/]*$/, '/learning_hub_migrate_v9_test');
process.env.MONGO_URI = MONGO_URI;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Meta = require('../src/models/Meta');
const Section = require('../src/models/Section');
const Question = require('../src/models/Question');
const { migrate, CURRENT } = require('../src/seed/migrate');
const { loadContent, defaultNodes, insertDefaultTerms } = require('../src/seed');

const NEW_FILES = ['48-node-database-integration.md', '49-sql-fundamentals.md', '50-postgresql.md'];
const owner = new mongoose.Types.ObjectId();
let sqlId;

before(async () => {
  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.syncIndexes();
  // a v8 database: no files 48-50; SQL and PostgreSQL are empty titled placeholders under Databases
  const files = loadContent().filter((f) => !NEW_FILES.includes(f.file));
  const nodes = defaultNodes(files);
  const ids = new Map(nodes.map((n) => [n.key, new mongoose.Types.ObjectId()]));
  await Section.insertMany(nodes.map((n) => ({
    _id: ids.get(n.key), key: n.key, seedFile: n.seedFile, owner: null, parent: n.parentKey ? ids.get(n.parentKey) : null,
    title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order,
  })));
  for (const n of nodes.filter((x) => x.questions)) {
    await Question.insertMany(n.questions.map((q, i) => ({ ...q, section: ids.get(n.key), owner: null, order: i })));
  }
  const databases = ids.get('backend/databases');
  for (const [key, title, order] of [['backend/databases/sql', 'SQL', 1], ['backend/databases/postgresql', 'PostgreSQL', 2]]) {
    if (!(await Section.exists({ key }))) await Section.create({ key, owner: null, parent: databases, title, icon: '🧾', color: '#6366f1', order });
  }
  sqlId = (await Section.findOne({ key: 'backend/databases/sql' }))._id;
  await Question.create({ section: sqlId, owner, title: 'My SQL notes', priority: 2, order: 0 });
  await insertDefaultTerms();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 8 } }, { upsert: true });
  await migrate();
});
after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

test('v9 adds database integration and fills the SQL and PostgreSQL placeholders', async () => {
  assert.equal((await Meta.findById('schemaVersion').lean()).value, CURRENT);
  const sql = await Section.findById(sqlId).lean();
  assert.equal(sql.seedFile, '49-sql-fundamentals.md');
  assert.equal(sql.title, 'SQL Fundamentals', 'placeholder adopts the file title and keeps its id');
  assert.equal(await Question.countDocuments({ section: sqlId, owner: null }), 6);
  assert.ok(await Question.findOne({ section: sqlId, title: 'My SQL notes', owner }), 'private page in the placeholder kept');
  const pg = await Section.findOne({ key: 'backend/databases/postgresql' }).lean();
  assert.equal(await Question.countDocuments({ section: pg._id, owner: null }), 6);
  const node = await Section.find({ parent: (await Section.findOne({ key: 'backend/nodejs' }))._id }).sort({ order: 1 }).lean();
  const keys = node.map((n) => n.key);
  assert.ok(keys.indexOf('backend/nodejs/database') === keys.indexOf('backend/nodejs/validation-errors') + 1, 'database comes right after validation-errors');
});

test('running v9 again changes nothing', async () => {
  const pages = await Question.countDocuments();
  await Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: 8 } });
  await migrate();
  assert.equal(await Question.countDocuments(), pages);
});
