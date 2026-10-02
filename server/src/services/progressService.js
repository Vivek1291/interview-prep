// Per-user learning state on any visible page: status, star and personal quick-revise notes.
const crypto = require('crypto');
const questionRepository = require('../repositories/questionRepository');
const sectionRepository = require('../repositories/sectionRepository');
const progressRepository = require('../repositories/progressRepository');
const ApiError = require('../utils/ApiError');
const { visibleFilter, isVisible } = require('./access');
const { subtreeIds } = require('./sectionService');

async function assertVisiblePage(user, id) {
  const q = await questionRepository.findById(id);
  if (!isVisible(user, q)) throw ApiError.notFound('Page not found');
  return q;
}

const shape = (p) => ({ status: p?.status || 'new', starred: p?.starred || false, notes: p?.notes || [] });

const progressService = {
  async set(user, questionId, { status, starred }) {
    await assertVisiblePage(user, questionId);
    const set = {};
    if (status !== undefined) set.status = status;
    if (starred !== undefined) set.starred = starred;
    return shape(await progressRepository.upsert(user.id, questionId, set));
  },

  async addNote(user, questionId, { text, color }) {
    await assertVisiblePage(user, questionId);
    return shape(await progressRepository.pushNote(user.id, questionId, { id: crypto.randomUUID(), text, color: color || '#fde68a' }));
  },

  async removeNote(user, questionId, noteId) {
    await assertVisiblePage(user, questionId);
    return shape(await progressRepository.pullNote(user.id, questionId, noteId));
  },

  /**
   * Quick Revise: every visible page that has author notes or my notes, in tree order,
   * optionally limited to one category and everything below it.
   */
  async revise(user, nodeId) {
    const nodes = await sectionRepository.find(visibleFilter(user));
    const byId = new Map(nodes.map((n) => [String(n._id), n]));
    if (nodeId && !byId.has(String(nodeId))) throw ApiError.notFound('Category not found');
    const scope = nodeId ? new Set(subtreeIds(nodes, nodeId)) : null;

    // depth-first order of nodes, so results follow the sidebar
    const children = new Map();
    for (const n of nodes) children.set(String(n.parent ?? ''), [...(children.get(String(n.parent ?? '')) || []), n]);
    const rank = new Map();
    const walk = (parent) => (children.get(parent) || []).forEach((n) => { rank.set(String(n._id), rank.size); walk(String(n._id)); });
    walk('');
    const pathOf = (id) => {
      const out = [];
      for (let n = byId.get(String(id)); n; n = n.parent ? byId.get(String(n.parent)) : null) out.unshift(n.title);
      return out;
    };

    const progress = await progressRepository.findForUser(user.id);
    const mine = new Map(progress.map((p) => [String(p.question), p]));
    const pages = await questionRepository.find(
      { $and: [visibleFilter(user), { $or: [{ 'quickNotes.0': { $exists: true } }, { _id: { $in: progress.filter((p) => p.notes.length).map((p) => p.question) } }] }] },
      'section owner title priority order quickNotes',
    );
    return pages
      .filter((q) => byId.has(String(q.section)) && (!scope || scope.has(String(q.section))))
      .sort((a, b) => rank.get(String(a.section)) - rank.get(String(b.section)) || a.order - b.order)
      .map((q) => {
        const s = byId.get(String(q.section));
        const p = mine.get(String(q._id));
        return {
          _id: q._id, title: q.title, priority: q.priority, status: p?.status || 'new',
          section: { _id: s._id, title: s.title, icon: s.icon, color: s.color }, path: pathOf(s._id),
          authorNotes: q.quickNotes, myNotes: p?.notes || [],
        };
      });
  },
};

module.exports = progressService;
