const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    icon: { type: String, default: '📘' },
    color: { type: String, default: '#6366f1' },
    description: { type: String, default: '' },
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Section', SectionSchema);
