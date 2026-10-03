const mongoose = require('mongoose');
const { BlockSchema } = require('./Question');

// A glossary term ("libuv", "Hydration", "Idempotent"…): a short summary for quick revision plus
// full content made of the same blocks as a page. Terms are linked automatically wherever they appear.
//   owner = null → shared term (made by an admin), owner = user → private term
const TermSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true, maxlength: 80 },
    aliases: { type: [String], default: [] },               // other spellings that link to this term
    summary: { type: String, default: '', maxlength: 400 }, // one or two sentences shown in previews
    blocks: { type: [BlockSchema], default: [] },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    key: { type: String, unique: true, sparse: true },      // stable id of a default (seeded) term
  },
  { timestamps: true, strict: true }
);

TermSchema.index({ owner: 1, term: 1 });

module.exports = mongoose.model('Term', TermSchema);
