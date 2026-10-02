const Progress = require('../models/Progress');

const progressRepository = {
  findForUser: (userId, questionIds) =>
    Progress.find({ user: userId, ...(questionIds ? { question: { $in: questionIds } } : {}) }).lean(),
  findOne: (userId, questionId) => Progress.findOne({ user: userId, question: questionId }).lean(),
  // upsert: create the progress row on first interaction, update it afterwards (one atomic operation)
  upsert: (userId, questionId, set) =>
    Progress.findOneAndUpdate({ user: userId, question: questionId }, { $set: set }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean(),
  pushNote: (userId, questionId, note) =>
    Progress.findOneAndUpdate({ user: userId, question: questionId }, { $push: { notes: note } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean(),
  pullNote: (userId, questionId, noteId) =>
    Progress.findOneAndUpdate({ user: userId, question: questionId }, { $pull: { notes: { id: noteId } } }, { new: true }).lean(),
  insertMany: (docs) => Progress.insertMany(docs, { ordered: false }),
  deleteMany: (filter) => Progress.deleteMany(filter),
  distinctQuestions: () => Progress.distinct('question'),
};

module.exports = progressRepository;
