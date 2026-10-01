// Usage (inside the api container):  npm run seed:reset
// ⚠️ Deletes ALL your content and restores the default questions.
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { resetToDefaults } = require('./index');

(async () => {
  await connectDB();
  const r = await resetToDefaults();
  console.log(`Reset done: ${r.sections} sections, ${r.questions} questions`);
  await mongoose.connection.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
