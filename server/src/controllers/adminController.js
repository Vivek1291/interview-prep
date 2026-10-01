const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const sectionRepository = require('../repositories/sectionRepository');
const questionRepository = require('../repositories/questionRepository');
const { resetToDefaults } = require('../seed');

exports.exportAll = asyncHandler(async (req, res) => {
  const [sections, questions] = await Promise.all([sectionRepository.findAll(), questionRepository.exportAll()]);
  res.setHeader('Content-Disposition', `attachment; filename="interview-prep-backup-${Date.now()}.json"`);
  res.json({ version: 1, exportedAt: new Date().toISOString(), sections, questions });
});

exports.importAll = asyncHandler(async (req, res) => {
  const { sections, questions } = req.body || {};
  if (!Array.isArray(sections) || !Array.isArray(questions)) {
    throw ApiError.badRequest('Backup must contain "sections" and "questions" arrays');
  }
  await Promise.all([sectionRepository.deleteAll(), questionRepository.deleteAll()]);
  await sectionRepository.insertMany(sections);
  await questionRepository.insertMany(questions);
  res.json({ success: true, sections: sections.length, questions: questions.length });
});

exports.reset = asyncHandler(async (req, res) => {
  const result = await resetToDefaults();
  res.json({ success: true, ...result });
});

exports.upload = (req, res, next) => {
  if (!req.file) return next(ApiError.badRequest('No file uploaded (field name must be "file")'));
  res.status(201).json({ success: true, url: `/uploads/${path.basename(req.file.path)}` });
};
