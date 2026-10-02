// Controller = HTTP layer. Reads req, calls service, sends a consistent response shape.
const asyncHandler = require('../utils/asyncHandler');
const sectionService = require('../services/sectionService');

exports.getTree = asyncHandler(async (req, res) => res.json({ success: true, data: await sectionService.getTree(req.user) }));
exports.get = asyncHandler(async (req, res) => res.json({ success: true, data: await sectionService.get(req.user, req.params.id) }));
exports.create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await sectionService.create(req.user, req.body) }));
exports.update = asyncHandler(async (req, res) => res.json({ success: true, data: await sectionService.update(req.user, req.params.id, req.body) }));
exports.remove = asyncHandler(async (req, res) => res.json({ success: true, data: await sectionService.remove(req.user, req.params.id) }));

exports.reorder = asyncHandler(async (req, res) => {
  await sectionService.reorder(req.user, req.body.ids);
  res.json({ success: true });
});
