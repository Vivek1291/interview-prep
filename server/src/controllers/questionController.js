const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const questionService = require('../services/questionService');
const progressService = require('../services/progressService');
const { objectId } = require('../validators/schemas');

exports.list = asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const section = typeof req.query.section === 'string' ? req.query.section : '';
  if (search) return res.json({ success: true, data: await questionService.search(req.user, search.slice(0, 100)) });
  if (section && objectId.safeParse(section).success) return res.json({ success: true, data: await questionService.listInSection(req.user, section) });
  throw ApiError.badRequest('Provide ?search= or ?section=');
});

exports.getById = asyncHandler(async (req, res) => res.json({ success: true, data: await questionService.getById(req.user, req.params.id) }));
exports.create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await questionService.create(req.user, req.body) }));
exports.update = asyncHandler(async (req, res) => res.json({ success: true, data: await questionService.update(req.user, req.params.id, req.body) }));

exports.remove = asyncHandler(async (req, res) => {
  await questionService.remove(req.user, req.params.id);
  res.status(204).end();
});

exports.reorder = asyncHandler(async (req, res) => {
  await questionService.reorder(req.user, req.body.ids);
  res.json({ success: true });
});

// The author's notes (part of the page)
exports.addAuthorNote = asyncHandler(async (req, res) =>
  res.status(201).json({ success: true, data: await questionService.addAuthorNote(req.user, req.params.id, req.body) }));
exports.removeAuthorNote = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await questionService.removeAuthorNote(req.user, req.params.id, req.params.noteId) }));

// My progress on a page
exports.setProgress = asyncHandler(async (req, res) => res.json({ success: true, data: await progressService.set(req.user, req.params.id, req.body) }));
exports.addMyNote = asyncHandler(async (req, res) =>
  res.status(201).json({ success: true, data: await progressService.addNote(req.user, req.params.id, req.body) }));
exports.removeMyNote = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await progressService.removeNote(req.user, req.params.id, req.params.noteId) }));

exports.revise = asyncHandler(async (req, res) => {
  const node = typeof req.query.node === 'string' && objectId.safeParse(req.query.node).success ? req.query.node : null;
  res.json({ success: true, data: await progressService.revise(req.user, node) });
});
