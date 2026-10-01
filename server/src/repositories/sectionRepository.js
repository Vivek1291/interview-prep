// Repository = the ONLY layer that talks to the database for this entity.
const Section = require('../models/Section');

const sectionRepository = {
  findAll: () => Section.find().sort({ order: 1 }).lean(),
  findById: (id) => Section.findById(id).lean(),
  count: () => Section.countDocuments(),
  maxOrder: async () => {
    const last = await Section.findOne().sort({ order: -1 }).select('order').lean();
    return last ? last.order : -1;
  },
  create: (data) => Section.create(data),
  insertMany: (docs) => Section.insertMany(docs),
  update: (id, data) => Section.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean(),
  delete: (id) => Section.findByIdAndDelete(id).lean(),
  deleteAll: () => Section.deleteMany({}),
  // bulkWrite = one round trip for many updates
  reorder: (ids) =>
    Section.bulkWrite(ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: index } } } }))),
};

module.exports = sectionRepository;
