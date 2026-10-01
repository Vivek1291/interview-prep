const mongoose = require('mongoose');

// A question is made of an ordered list of "blocks" (rich text, code, callout, diagram, chart...).
// Blocks are EMBEDDED because they are always read/written together with the question
// (classic "embed vs reference" decision — see the MongoDB section in the app!).
const BlockSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'callout', 'code', 'diagram', 'chart', 'image', 'links'],
      required: true,
    },
    title: { type: String, default: '' },
    content: { type: String, default: '' }, // HTML for text/callout, source for code/diagram, CSV for chart
    color: { type: String, default: '' },
    variant: { type: String, default: '' }, // callout preset: note | tip | warning | ask | understand | important
    lang: { type: String, default: '' }, // code language
    chartType: { type: String, default: '' }, // bar | line | area
    collapsed: { type: Boolean, default: false },
  },
  { _id: false }
);

const QuickNoteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    color: { type: String, default: '#fde68a' },
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    title: { type: String, required: true, trim: true },
    priority: { type: Number, min: 1, max: 3, default: 2 }, // 3 = must know
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['new', 'learning', 'revise', 'confident'],
      default: 'new',
    },
    starred: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    blocks: { type: [BlockSchema], default: [] },
    quickNotes: { type: [QuickNoteSchema], default: [] },
  },
  { timestamps: true }
);

// Compound index: we always list questions of a section in order.
QuestionSchema.index({ section: 1, order: 1 });

module.exports = mongoose.model('Question', QuestionSchema);
