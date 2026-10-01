const crypto = require('crypto');
const questionRepository = require('../repositories/questionRepository');
const sectionRepository = require('../repositories/sectionRepository');
const ApiError = require('../utils/ApiError');

const questionService = {
  list({ search, section }) {
    if (search && search.trim()) return questionRepository.search(search.trim());
    return questionRepository.findSummaries(section ? { section } : {});
  },

  async getById(id) {
    const q = await questionRepository.findById(id);
    if (!q) throw ApiError.notFound('Question not found');
    return q;
  },

  async create(data) {
    const section = await sectionRepository.findById(data.section);
    if (!section) throw ApiError.badRequest('Section does not exist');
    const order = (await questionRepository.maxOrderInSection(data.section)) + 1;
    const blocks = data.blocks?.length
      ? data.blocks
      : [{ id: crypto.randomUUID(), type: 'text', title: 'Answer', content: '<p>Write your answer here…</p>' }];
    return questionRepository.create({ ...data, blocks, order });
  },

  async update(id, data) {
    if (data.section) {
      const section = await sectionRepository.findById(data.section);
      if (!section) throw ApiError.badRequest('Section does not exist');
    }
    const updated = await questionRepository.update(id, data);
    if (!updated) throw ApiError.notFound('Question not found');
    return updated;
  },

  async remove(id) {
    const deleted = await questionRepository.delete(id);
    if (!deleted) throw ApiError.notFound('Question not found');
    return deleted;
  },

  reorder: (ids, sectionId) => questionRepository.reorder(ids, sectionId),

  async addQuickNote(id, { text, color }) {
    const note = { id: crypto.randomUUID(), text, color: color || '#fde68a' };
    const updated = await questionRepository.pushQuickNote(id, note);
    if (!updated) throw ApiError.notFound('Question not found');
    return updated;
  },

  async removeQuickNote(id, noteId) {
    const updated = await questionRepository.pullQuickNote(id, noteId);
    if (!updated) throw ApiError.notFound('Question not found');
    return updated;
  },

  quickNotes: (sectionId) => questionRepository.quickNotes(sectionId),

  async stats() {
    const [sections, rows, total] = await Promise.all([
      sectionRepository.findAll(),
      questionRepository.stats(),
      questionRepository.count(),
    ]);
    const map = new Map(rows.map((r) => [String(r._id), r]));
    return {
      total,
      sections: sections.map((s) => {
        const r = map.get(String(s._id)) || { total: 0, statuses: {} };
        return {
          _id: s._id, title: s.title, icon: s.icon, color: s.color, total: r.total,
          new: r.statuses.new || 0, learning: r.statuses.learning || 0,
          revise: r.statuses.revise || 0, confident: r.statuses.confident || 0,
        };
      }),
    };
  },
};

module.exports = questionService;
