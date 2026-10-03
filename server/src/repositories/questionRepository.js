const Question = require('../models/Question');

const SUMMARY_FIELDS = 'section parent owner title priority tags order';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const questionRepository = {
  findSummaries: (filter = {}) => Question.find(filter).select(SUMMARY_FIELDS).sort({ order: 1, createdAt: 1 }).lean(),

  search: (term, visible) => {
    const rx = new RegExp(escapeRegex(term), 'i');
    return Question.find({ $and: [visible, { $or: [{ title: rx }, { tags: rx }, { 'blocks.content': rx }, { 'quickNotes.text': rx }] }] })
      .select(SUMMARY_FIELDS)
      .sort({ priority: -1, order: 1 })
      .limit(100)
      .lean();
  },

  find: (filter, projection) => Question.find(filter, projection).lean(),
  findById: (id) => Question.findById(id).lean(),
  count: (filter = {}) => Question.countDocuments(filter),
  /** highest order among siblings (same section and same parent page) */
  maxOrderAmong: async (sectionId, parentId = null) => {
    const last = await Question.findOne({ section: sectionId, parent: parentId ?? null }).sort({ order: -1 }).select('order').lean();
    return last ? last.order : -1;
  },
  maxOrderInSection: async (sectionId) => {
    const last = await Question.findOne({ section: sectionId }).sort({ order: -1 }).select('order').lean();
    return last ? last.order : -1;
  },
  create: (data) => Question.create(data),
  insertMany: (docs) => Question.insertMany(docs),
  update: (id, data) => Question.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
  updateMany: (filter, update) => Question.updateMany(filter, update),
  delete: (id) => Question.findByIdAndDelete(id).lean(),
  deleteMany: (filter) => Question.deleteMany(filter),

  reorder: (ids) =>
    Question.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index } } } }))),

  // $push / $pull — atomic array operators (no read-modify-write race)
  pushQuickNote: (id, note) => Question.findByIdAndUpdate(id, { $push: { quickNotes: note } }, { new: true }).lean(),
  pullQuickNote: (id, noteId) => Question.findByIdAndUpdate(id, { $pull: { quickNotes: { id: noteId } } }, { new: true }).lean(),
};

module.exports = questionRepository;
