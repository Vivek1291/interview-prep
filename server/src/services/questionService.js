// Pages (questions / lessons / articles) inside tree nodes.
const crypto = require('crypto');
const questionRepository = require('../repositories/questionRepository');
const sectionRepository = require('../repositories/sectionRepository');
const progressRepository = require('../repositories/progressRepository');
const ApiError = require('../utils/ApiError');
const { visibleFilter, isVisible, canEdit, ownerFor, assertCanPlaceIn, assertCanEdit } = require('./access');

async function withProgress(user, pages) {
  const progress = await progressRepository.findForUser(user.id, pages.map((p) => p._id));
  const mine = new Map(progress.map((p) => [String(p.question), p]));
  return pages.map((p) => ({ ...p, status: mine.get(String(p._id))?.status || 'new', starred: mine.get(String(p._id))?.starred || false, canEdit: canEdit(user, p) }));
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
    await findSectionFor(user, data.section, owner);
    const order = (await questionRepository.maxOrderInSection(data.section)) + 1;
    const blocks = data.blocks?.length
      ? data.blocks
      : [{ id: crypto.randomUUID(), type: 'text', title: 'Answer', content: '<p>Write your answer here…</p>' }];
    const q = await questionRepository.create({ ...data, blocks, order, owner });
    return { ...q.toObject(), canEdit: true };
  },

  async update(user, id, data) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    if (data.section && String(data.section) !== String(q.section)) {
      await findSectionFor(user, data.section, q.owner);
      data.order = (await questionRepository.maxOrderInSection(data.section)) + 1;
    }
    const updated = await questionRepository.update(id, data);
    return questionService.getById(user, updated._id);
  },

  async remove(user, id) {
    const q = await questionRepository.findById(id);
    assertCanEdit(user, q, 'page');
    await questionRepository.delete(id);
    await progressRepository.deleteMany({ question: id });
  },

  async reorder(user, ids) {
    const pages = await questionRepository.find({ _id: { $in: ids } }, 'section owner');
    if (pages.length !== ids.length) throw ApiError.notFound('Page not found');
    if (new Set(pages.map((p) => String(p.section))).size > 1) throw ApiError.badRequest('Pages must be in the same category');
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
