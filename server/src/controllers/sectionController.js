// Controller = HTTP layer. Reads req, calls service, sends a consistent response shape.
const asyncHandler = require('../utils/asyncHandler');
const sectionService = require('../services/sectionService');

exports.getTree = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await sectionService.getTree() });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await sectionService.create(req.body) });
});

exports.update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await sectionService.update(req.params.id, req.body) });
});

exports.remove = asyncHandler(async (req, res) => {
  await sectionService.remove(req.params.id);
  res.status(204).end();
});

exports.reorder = asyncHandler(async (req, res) => {
  await sectionService.reorder(req.body.ids);
  res.json({ success: true });
});
