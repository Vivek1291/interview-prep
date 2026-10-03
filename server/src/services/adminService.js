// Admin-only maintenance of the SHARED content. Users' private content and progress are never touched,
// except that private items left without a parent are rescued by recoverOrphans().
const Section = require('../models/Section');
const Question = require('../models/Question');
const Term = require('../models/Term');
const ApiError = require('../utils/ApiError');
const { resetToDefaults } = require('../seed');
const { recoverOrphans } = require('./maintenance');

const adminService = {
  async exportShared() {
    const [sections, questions, terms] = await Promise.all([
      Section.find({ owner: null }).sort({ order: 1 }).lean(),
      Question.find({ owner: null }).sort({ order: 1 }).lean(),
      Term.find({ owner: null }).sort({ term: 1 }).lean(),
    ]);
    return { version: 3, exportedAt: new Date().toISOString(), sections, questions, terms };
  },

  async importShared({ sections, questions, terms }) {
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
    // older backups have no terms: keep the current shared terms in that case
    if (Array.isArray(terms)) {
      await Term.deleteMany({ owner: null });
      await Term.insertMany(terms.map(({ owner, ...t }) => ({ ...t, owner: null })));
    }
    const recovered = await recoverOrphans();
    return { sections: sections.length, questions: questions.length, terms: Array.isArray(terms) ? terms.length : undefined, recovered };
  },

  reset: async () => ({ ...(await resetToDefaults()) }),
};

module.exports = adminService;
