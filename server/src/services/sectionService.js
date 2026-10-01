// Service = business logic. Knows nothing about req/res (HTTP) — easy to unit test.
const sectionRepository = require('../repositories/sectionRepository');
const questionRepository = require('../repositories/questionRepository');
const ApiError = require('../utils/ApiError');

const sectionService = {
  // Sidebar tree: sections + light question summaries (no heavy blocks)
  async getTree() {
    const [sections, questions] = await Promise.all([
      sectionRepository.findAll(),
      questionRepository.findSummaries(),
    ]);
    const bySection = new Map(sections.map((s) => [String(s._id), { ...s, questions: [] }]));
    for (const q of questions) bySection.get(String(q.section))?.questions.push(q);
    return [...bySection.values()];
  },

  async create(data) {
    const order = (await sectionRepository.maxOrder()) + 1;
    return sectionRepository.create({ ...data, order });
  },

  async update(id, data) {
    const updated = await sectionRepository.update(id, data);
    if (!updated) throw ApiError.notFound('Section not found');
    return updated;
  },

  async remove(id) {
    const deleted = await sectionRepository.delete(id);
    if (!deleted) throw ApiError.notFound('Section not found');
    await questionRepository.deleteBySection(id); // cascade delete
    return deleted;
  },

  reorder: (ids) => sectionRepository.reorder(ids),
};

module.exports = sectionService;
