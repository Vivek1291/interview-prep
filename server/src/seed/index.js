const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseFile } = require('./parser');
const Section = require('../models/Section');
const Question = require('../models/Question');

const CONTENT_DIR = path.join(__dirname, 'content');

function loadContent() {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseFile(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8'), f));
}

async function insertDefaults() {
  const files = loadContent();
  let questionCount = 0;
  for (const [sIndex, { section, questions }] of files.entries()) {
    const sectionId = new mongoose.Types.ObjectId();
    await Section.create({ _id: sectionId, ...section, order: sIndex });
    await Question.insertMany(questions.map((q, qIndex) => ({ ...q, section: sectionId, order: qIndex })));
    questionCount += questions.length;
  }
  return { sections: files.length, questions: questionCount };
}

// Seed only when the DB is empty → your edits are never overwritten on restart.
async function seedIfEmpty() {
  const count = await Section.countDocuments();
  if (count > 0) {
    console.log(`📚 Database already has ${count} sections — skipping seed`);
    return;
  }
  const result = await insertDefaults();
  console.log(`🌱 Seeded ${result.sections} sections and ${result.questions} questions`);
}

async function resetToDefaults() {
  await Promise.all([Section.deleteMany({}), Question.deleteMany({})]);
  return insertDefaults();
}

module.exports = { seedIfEmpty, resetToDefaults, loadContent };
