// Pages (questions / lessons / articles) inside tree nodes.
const crypto = require('crypto');
const questionRepository = require('../repositories/questionRepository');
const sectionRepository = require('../repositories/sectionRepository');
const progressRepository = require('../repositories/progressRepository');
const ApiError = require('../utils/ApiError');
const { visibleFilter, isVisible, canEdit, ownerFor, assertCanPlaceIn, assertCanEdit } = require('./access');
const { recoverOrphans } = require('./maintenance');

async function withProgress(user, pages) {
  const progress = await progressRepository.findForUser(user.id, pages.map((p) => p._id));
  const mine = new Map(progress.map((p) => [String(p.question), p]));
  return pages.map((p) => ({ ...p, status: mine.get(String(p._id))?.status || 'new', starred: mine.get(String(p._id))?.starred || false, canEdit: canEdit(user, p) }));
}

/** ids of a page and all its sub-pages (any depth) */
async function pageSubtree(rootId) {
  const ids = [String(rootId)];
  for (let i = 0; i < ids.length; i += 1) {
    const kids = await questionRepository.find({ parent: ids[i] }, '_id');
    ids.push(...kids.map((k) => String(k._id)));
  }
  return ids;
}

/** The parent page for a new/moved page: visible, and allowed to hold content of this owner. */
async function findParentPageFor(user, parentId, owner) {
  const parent = await questionRepository.findById(parentId);
  if (!isVisible(user, parent)) throw ApiError.notFound('Parent page not found');
  assertCanPlaceIn(user, parent, owner);
  return parent;
}

async function findSectionFor(user, sectionId, owner) {
  const section = await sectionRepository.findById(sectionId);
  if (!section) throw ApiError.notFound('Category not found');
  assertCanPlaceIn(user, section, owner);
  return section;
}

const questionService = {
  async search(user, term) {
    return withProgress(user, await questionRepository.search(term, visibleFilter(user)));
  },

  async listInSection(user, sectionId) {
    return withProgress(user, await questionRepository.findSummaries({ $and: [visibleFilter(user), { section: sectionId }] }));
  },

  async getById(user, id) {
    const q = await questionRepository.findById(id);
    if (!isVisible(user, q)) throw ApiError.notFound('Page not found');
    const p = await progressRepository.findOne(user.id, id);
    return { ...q, canEdit: canEdit(user, q), progress: { status: p?.status || 'new', starred: p?.starred || false, notes: p?.notes || [] } };
  },

  async create(user, data) {
    const owner = ownerFor(user);
    if (data.parent) {
      const parent = await findParentPageFor(user, data.parent, owner);
      data = { ...data, section: parent.section };            // a sub-page lives in its parent's section
    } else {
      data = { ...data, parent: null };
    }
    await findSectionFor(user, data.section, owner);
    const order = (await questionRepository.maxOrderAmong(data.section, data.parent)) + 1;
    const blocks = data.blocks?.length
      ? data.blocks
      : [{ id: crypto.randomUUID(), type: 'text', title: 'Answer', content: '<p>Write your answer here…</p>' }];
    const q = await questionRepository.create({ ...data, blocks, order, owner });
    return { ...q.toObject(), canEdit: true };
  },

  async update(user, id, data) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    const parentChanged = 'parent' in data && String(data.parent ?? '') !== String(q.parent ?? '');
    if (parentChanged && data.parent) {
      if ((await pageSubtree(id)).includes(String(data.parent))) throw ApiError.badRequest('A page cannot be moved inside itself');
      const parent = await findParentPageFor(user, data.parent, q.owner);
      data.section = parent.section;                           // follow the new parent
    } else if (!parentChanged && data.section && String(data.section) !== String(q.section)) {
      data.parent = null;                                      // moved to another category: leaves its parent page
    }
    const sectionChanged = data.section && String(data.section) !== String(q.section);
    if (sectionChanged) await findSectionFor(user, data.section, q.owner);
    if (sectionChanged || parentChanged || ('parent' in data && data.parent === null && q.parent)) {
      data.order = (await questionRepository.maxOrderAmong(data.section ?? q.section, data.parent ?? null)) + 1;
    }
    const updated = await questionRepository.update(id, data);
    if (sectionChanged) {
      // sub-pages move with their parent
      const subtree = (await pageSubtree(id)).filter((x) => x !== String(id));
      if (subtree.length) await questionRepository.updateMany({ _id: { $in: subtree } }, { $set: { section: data.section } });
    }
    return questionService.getById(user, updated._id);
  },

  async remove(user, id) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    // delete the page and its sub-pages of the same owner; other users' private sub-pages are rescued
    const subtree = await pageSubtree(id);
    const same = (await questionRepository.find({ _id: { $in: subtree }, owner: q.owner ?? null }, '_id')).map((p) => p._id);
    await questionRepository.deleteMany({ _id: { $in: same } });
    await progressRepository.deleteMany({ question: { $in: same } });
    await recoverOrphans();
  },

  async reorder(user, ids) {
    const pages = await questionRepository.find({ _id: { $in: ids } }, 'section parent owner');
    if (pages.length !== ids.length) throw ApiError.notFound('Page not found');
    if (new Set(pages.map((p) => `${p.section}|${p.parent ?? ''}`)).size > 1) throw ApiError.badRequest('Pages must be siblings (same category and parent page)');
    if (pages.some((p) => !canEdit(user, p))) throw ApiError.forbidden('Only admins can reorder shared pages');
    await questionRepository.reorder(ids);
  },

  // The author's quick-revise notes are part of the page content: only editors change them.
  async addAuthorNote(user, id, { text, color }) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    await questionRepository.pushQuickNote(id, { id: crypto.randomUUID(), text, color: color || '#fde68a' });
    return questionService.getById(user, id);
  },

  async removeAuthorNote(user, id, noteId) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    await questionRepository.pullQuickNote(id, noteId);
    return questionService.getById(user, id);
  },
};

module.exports = questionService;
