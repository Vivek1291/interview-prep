// Admin-only maintenance of the SHARED content. Users' private content and progress are never touched,
// except that private items left without a parent are rescued by recoverOrphans().
const Section = require('../models/Section');
const Question = require('../models/Question');
const ApiError = require('../utils/ApiError');
const { resetToDefaults } = require('../seed');
const { recoverOrphans } = require('./maintenance');

const adminService = {
  async exportShared() {
    const [sections, questions] = await Promise.all([
      Section.find({ owner: null }).sort({ order: 1 }).lean(),
      Question.find({ owner: null }).sort({ order: 1 }).lean(),
    ]);
    return { version: 2, exportedAt: new Date().toISOString(), sections, questions };
  },

  async importShared({ sections, questions }) {
    if (!Array.isArray(sections) || !Array.isArray(questions)) {
      throw ApiError.badRequest('Backup must contain "sections" and "questions" arrays');
    }
    // v1 backups (flat sections) have no parent: they become top-level shared categories.
    const cleanSection = ({ _id, title, icon, color, description, order, parent, key, seedFile }) =>
      ({ _id, title, icon, color, description, order, parent: parent ?? null, key, seedFile, owner: null });
    const cleanQuestion = ({ status, starred, owner, ...q }) => ({ ...q, owner: null });
    await Promise.all([Section.deleteMany({ owner: null }), Question.deleteMany({ owner: null })]);
    await Section.insertMany(sections.map(cleanSection));
    await Question.insertMany(questions.map(cleanQuestion));
    const recovered = await recoverOrphans();
    return { sections: sections.length, questions: questions.length, recovered };
  },

  reset: async () => ({ ...(await resetToDefaults()) }),
};

module.exports = adminService;
