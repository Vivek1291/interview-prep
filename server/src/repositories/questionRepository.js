const mongoose = require('mongoose');
const Question = require('../models/Question');

const SUMMARY_FIELDS = 'section title priority tags status starred order';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const questionRepository = {
  findSummaries: (filter = {}) => Question.find(filter).select(SUMMARY_FIELDS).sort({ order: 1 }).lean(),

  search: (term) => {
    const rx = new RegExp(escapeRegex(term), 'i');
    return Question.find({ $or: [{ title: rx }, { tags: rx }, { 'blocks.content': rx }, { 'quickNotes.text': rx }] })
      .select(SUMMARY_FIELDS)
      .sort({ priority: -1, order: 1 })
      .limit(100)
      .lean();
  },

  findById: (id) => Question.findById(id).lean(),
  countInSection: (sectionId) => Question.countDocuments({ section: sectionId }),
  count: () => Question.countDocuments(),
  maxOrderInSection: async (sectionId) => {
    const last = await Question.findOne({ section: sectionId }).sort({ order: -1 }).select('order').lean();
    return last ? last.order : -1;
  },
  create: (data) => Question.create(data),
  insertMany: (docs) => Question.insertMany(docs),
  update: (id, data) => Question.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
  delete: (id) => Question.findByIdAndDelete(id).lean(),
  deleteBySection: (sectionId) => Question.deleteMany({ section: sectionId }),
  deleteAll: () => Question.deleteMany({}),

  reorder: (ids, sectionId) =>
    Question.bulkWrite(
      ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { order: index, ...(sectionId ? { section: sectionId } : {}) } },
        },
      }))
    ),

  // $push / $pull — atomic array operators (no read-modify-write race)
  pushQuickNote: (id, note) =>
    Question.findByIdAndUpdate(id, { $push: { quickNotes: note } }, { new: true }).lean(),
  pullQuickNote: (id, noteId) =>
    Question.findByIdAndUpdate(id, { $pull: { quickNotes: { id: noteId } } }, { new: true }).lean(),

  // Aggregation pipeline: $match → $lookup (join) → $unwind → $sort → $project
  quickNotes: (sectionId) =>
    Question.aggregate([
      { $match: { 'quickNotes.0': { $exists: true }, ...(sectionId ? { section: new mongoose.Types.ObjectId(sectionId) } : {}) } },
      { $lookup: { from: 'sections', localField: 'section', foreignField: '_id', as: 'sectionDoc' } },
      { $unwind: '$sectionDoc' },
      { $sort: { 'sectionDoc.order': 1, order: 1 } },
      {
        $project: {
          title: 1, priority: 1, status: 1, quickNotes: 1,
          section: { _id: '$sectionDoc._id', title: '$sectionDoc.title', icon: '$sectionDoc.icon', color: '$sectionDoc.color' },
        },
      },
    ]),

  // $group — progress stats per section and status
  stats: () =>
    Question.aggregate([
      { $group: { _id: { section: '$section', status: '$status' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.section', statuses: { $push: { k: '$_id.status', v: '$count' } }, total: { $sum: '$count' } } },
      { $project: { total: 1, statuses: { $arrayToObject: '$statuses' } } },
    ]),

  exportAll: () => Question.find().sort({ order: 1 }).lean(),
};

module.exports = questionRepository;
