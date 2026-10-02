const mongoose = require('mongoose');

// One document per (user, page): that user's status, star and personal revision notes.
// Keeping this separate from the page means every learner has their own progress on shared content.
const NoteSchema = new mongoose.Schema(
  { id: { type: String, required: true }, text: { type: String, required: true }, color: { type: String, default: '#fde68a' } },
  { _id: false }
);

const ProgressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    status: { type: String, enum: ['new', 'learning', 'revise', 'confident'], default: 'new' },
    starred: { type: Boolean, default: false },
    notes: { type: [NoteSchema], default: [] },
  },
  { timestamps: true }
);

ProgressSchema.index({ user: 1, question: 1 }, { unique: true });
ProgressSchema.index({ question: 1 });

module.exports = mongoose.model('Progress', ProgressSchema);
