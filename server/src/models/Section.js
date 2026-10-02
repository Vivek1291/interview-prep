const mongoose = require('mongoose');

// A node in the navigation tree (category / topic). Unlimited depth via `parent`.
//   owner = null      → common content, created by admins, visible to everyone
//   owner = <userId>  → private content of that user (they can do anything with it)
const SectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, default: '📘' },
    color: { type: String, default: '#6366f1' },
    description: { type: String, default: '' },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    order: { type: Number, default: 0 },
    key: { type: String, default: undefined },   // stable id for seeded nodes, e.g. "backend/nodejs"
    seedFile: { type: String, default: undefined }, // seed content file this node was created from
  },
  { timestamps: true }
);

SectionSchema.index({ parent: 1, order: 1 });
SectionSchema.index({ owner: 1 });
SectionSchema.index({ key: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Section', SectionSchema);
