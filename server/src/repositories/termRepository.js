const Term = require('../models/Term');

const LIST_FIELDS = 'term aliases summary owner updatedAt';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const termRepository = {
  list: (filter) => Term.find(filter).select(LIST_FIELDS).collation({ locale: 'en', strength: 2 }).sort({ term: 1 }).lean(),
  findById: (id) => Term.findById(id).lean(),
  /** same name (case-insensitive) for the same owner */
  findSameName: (owner, term, exceptId) => Term.findOne({
    owner: owner ?? null,
    term: new RegExp(`^${escapeRegex(term.trim())}$`, 'i'),
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean(),
  create: (data) => Term.create(data),
  update: (id, data) => Term.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
  delete: (id) => Term.findByIdAndDelete(id).lean(),
  deleteMany: (filter) => Term.deleteMany(filter),
  insertMany: (docs) => Term.insertMany(docs),
  find: (filter) => Term.find(filter).lean(),
  count: (filter = {}) => Term.countDocuments(filter),
};

module.exports = termRepository;
