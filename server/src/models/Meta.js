const mongoose = require('mongoose');

// Small key/value store for app-level state: generated secrets, schema version, migration leftovers.
const MetaSchema = new mongoose.Schema(
  {
    _id: { type: String },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Meta', MetaSchema);
