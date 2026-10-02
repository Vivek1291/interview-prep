// Schema migrations, run once at startup. Each step is idempotent and recorded in Meta("schemaVersion").
//
// v2: flat sections → tree + users.
//   - keeps every existing section, page, id and edit
//   - places each old section into the new tree (matched by title against the seed files)
//   - adds the default skeleton (Frontend, Backend, … with empty placeholders)
//   - moves per-page status/star out of the pages into a stash that the first admin account claims
const mongoose = require('mongoose');
const Meta = require('../models/Meta');
const Section = require('../models/Section');
const { defaultNodes, seedIfEmpty, UNCATEGORISED } = require('./index');

const CURRENT = 2;

async function getVersion() {
  return (await Meta.findById('schemaVersion').lean())?.value ?? null;
}
const setVersion = (v) => Meta.updateOne({ _id: 'schemaVersion' }, { $set: { value: v } }, { upsert: true });

async function migrateToV2() {
  const raw = mongoose.connection.db;
  const questions = raw.collection('questions');

  // 1) Stash per-page progress (old schema stored it on the page itself)
  const legacy = await questions.find({ $or: [{ status: { $exists: true, $ne: 'new' } }, { starred: true }] }, { projection: { status: 1, starred: 1 } }).toArray();
  if (legacy.length) {
    await Meta.updateOne({ _id: 'legacyProgress' }, { $set: { value: legacy.map((q) => ({ question: q._id, status: q.status || 'new', starred: !!q.starred })) } }, { upsert: true });
  }
  await questions.updateMany({}, { $unset: { status: '', starred: '' } });
  await questions.updateMany({ owner: { $exists: false } }, { $set: { owner: null } });

  // 2) Create the skeleton and attach the old sections where they belong
  const nodes = defaultNodes();
  const byTitle = new Map(nodes.filter((n) => n.seedFile).map((n) => [n.title.toLowerCase(), n]));
  const old = await Section.find({ key: { $exists: false } }).lean();
  const idByKey = new Map();
  const oldMatched = new Map();                         // old section id → default node
  for (const s of old) {
    const match = byTitle.get(s.title.toLowerCase());
    if (match && !idByKey.has(match.key)) { idByKey.set(match.key, s._id); oldMatched.set(String(s._id), match); }
  }
  for (const n of nodes.filter((x) => !x.seedFile)) {
    const existing = await Section.findOne({ key: n.key }).lean();
    idByKey.set(n.key, existing ? existing._id : new mongoose.Types.ObjectId());
  }
  for (const n of nodes.filter((x) => !x.seedFile)) {
    await Section.updateOne(
      { _id: idByKey.get(n.key) },
      { $setOnInsert: { key: n.key, owner: null, parent: n.parentKey ? idByKey.get(n.parentKey) : null, title: n.title, icon: n.icon, color: n.color, description: n.description || '', order: n.order } },
      { upsert: true },
    );
  }
  let uncategorisedId = null;
  for (const s of old) {
    const match = oldMatched.get(String(s._id));
    if (match) {
      await Section.updateOne({ _id: s._id }, { $set: { key: match.key, seedFile: match.seedFile, owner: null, parent: idByKey.get(match.parentKey), order: match.order } });
    } else {
      if (!uncategorisedId) {
        uncategorisedId = (await Section.findOneAndUpdate({ key: UNCATEGORISED.key }, { $setOnInsert: { ...UNCATEGORISED, owner: null, parent: null, order: 1000 } }, { upsert: true, new: true }))._id;
      }
      await Section.updateOne({ _id: s._id }, { $set: { owner: null, parent: uncategorisedId } });
    }
  }
  return { stashedProgress: legacy.length, placed: oldMatched.size, uncategorised: old.length - oldMatched.size };
}

async function migrate() {
  const version = await getVersion();
  if (version === CURRENT) return;
  if (version == null && (await Section.countDocuments()) === 0) {
    await seedIfEmpty();                                // fresh install: seed straight into the new schema
  } else if (version == null || version < 2) {
    const r = await migrateToV2();
    console.log(`🔁 Migrated to v2: ${r.placed} sections placed in the tree, ${r.uncategorised} uncategorised, ${r.stashedProgress} progress rows kept for the first admin`);
  }
  await setVersion(CURRENT);
}

module.exports = { migrate, CURRENT };
