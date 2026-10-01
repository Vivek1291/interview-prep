const asyncHandler = require('../utils/asyncHandler');
const questionService = require('../services/questionService');

exports.list = asyncHandler(async (req, res) => {
  const { search, section } = req.query;
  res.json({ success: true, data: await questionService.list({ search, section }) });
});

exports.getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await questionService.getById(req.params.id) });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await questionService.create(req.body) });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await questionService.update(req.params.id, req.body) });
});

exports.remove = asyncHandler(async (req, res) => {
  await questionService.remove(req.params.id);
  res.status(204).end();
});

exports.reorder = asyncHandler(async (req, res) => {
  await questionService.reorder(req.body.ids, req.body.sectionId);
  res.json({ success: true });
});

exports.addQuickNote = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await questionService.addQuickNote(req.params.id, req.body) });
});

exports.removeQuickNote = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await questionService.removeQuickNote(req.params.id, req.params.noteId) });
});

exports.quickNotes = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await questionService.quickNotes(req.query.section) });
});

exports.stats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await questionService.stats() });
});
