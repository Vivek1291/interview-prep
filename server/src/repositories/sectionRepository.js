// Repository = the ONLY layer that talks to the database for this entity.
const Section = require('../models/Section');

const sectionRepository = {
  find: (filter = {}) => Section.find(filter).sort({ order: 1, createdAt: 1 }).lean(),
  findAll: () => Section.find().sort({ order: 1, createdAt: 1 }).lean(),
  findById: (id) => Section.findById(id).lean(),
  findByKey: (key) => Section.findOne({ key }).lean(),
  count: (filter = {}) => Section.countDocuments(filter),
  maxOrder: async (parent) => {
    const last = await Section.findOne({ parent: parent ?? null }).sort({ order: -1 }).select('order').lean();
    return last ? last.order : -1;
  },
  create: (data) => Section.create(data),
  insertMany: (docs) => Section.insertMany(docs),
  update: (id, data) => Section.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
  updateMany: (filter, update) => Section.updateMany(filter, update),
  deleteMany: (filter) => Section.deleteMany(filter),
  // bulkWrite = one round trip for many updates
  reorder: (ids) =>
    Section.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index } } } }))),
};

module.exports = sectionRepository;
