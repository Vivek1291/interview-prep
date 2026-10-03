// Keeps the tree consistent after deletes, resets and imports.
// When an admin deletes a shared category, users' PRIVATE items inside it must not disappear:
//   - private categories whose parent is gone move to the user's top level
//   - private pages whose category is gone move into the user's "Recovered" category
//   - shared pages whose category is gone are deleted (they were part of the deleted content)
//   - progress rows of pages that no longer exist are removed
const Section = require('../models/Section');
const Question = require('../models/Question');
const Progress = require('../models/Progress');

async function recoverOrphans() {
  const nodes = await Section.find({}, '_id parent owner').lean();
  const nodeIds = new Set(nodes.map((n) => String(n._id)));

  const orphanNodes = nodes.filter((n) => n.parent && !nodeIds.has(String(n.parent))).map((n) => n._id);
  if (orphanNodes.length) await Section.updateMany({ _id: { $in: orphanNodes } }, { $set: { parent: null } });

  const orphanPages = await Question.find({ section: { $nin: [...nodeIds] } }, '_id owner').lean();
  const common = orphanPages.filter((p) => p.owner == null).map((p) => p._id);
  if (common.length) await Question.deleteMany({ _id: { $in: common } });
  const byOwner = new Map();
  for (const p of orphanPages.filter((x) => x.owner != null)) {
    byOwner.set(String(p.owner), [...(byOwner.get(String(p.owner)) || []), p._id]);
  }
  for (const [owner, pageIds] of byOwner) {
    let recovered = await Section.findOne({ owner, parent: null, title: 'Recovered' }).lean();
    if (!recovered) {
      recovered = await Section.create({ owner, parent: null, title: 'Recovered', icon: '📦', color: '#64748b', description: 'Your pages whose category was deleted.', order: 9999 });
    }
    await Question.updateMany({ _id: { $in: pageIds } }, { $set: { section: recovered._id } });
  }

  // sub-pages whose parent page is gone (or now lives in another category) become top-level pages
  const allPages = await Question.find({}, '_id parent section').lean();
  const pageById = new Map(allPages.map((p) => [String(p._id), p]));
  const loose = allPages.filter((p) => p.parent && (!pageById.has(String(p.parent)) || String(pageById.get(String(p.parent)).section) !== String(p.section))).map((p) => p._id);
  if (loose.length) await Question.updateMany({ _id: { $in: loose } }, { $set: { parent: null } });

  const pageIds = new Set((await Question.find({}, '_id').lean()).map((p) => String(p._id)));
  const stale = (await Progress.distinct('question')).filter((id) => !pageIds.has(String(id)));
  if (stale.length) await Progress.deleteMany({ question: { $in: stale } });

  return { movedCategories: orphanNodes.length, deletedSharedPages: common.length, recoveredPages: orphanPages.length - common.length, detachedSubPages: loose.length, removedProgress: stale.length };
}

module.exports = { recoverOrphans };
