// Controller = HTTP layer for glossary terms.
const asyncHandler = require('../utils/asyncHandler');
const termService = require('../services/termService');

exports.list = asyncHandler(async (req, res) => res.json({ success: true, data: await termService.list(req.user) }));
exports.get = asyncHandler(async (req, res) => res.json({ success: true, data: await termService.get(req.user, req.params.id) }));
exports.create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await termService.create(req.user, req.body) }));
exports.update = asyncHandler(async (req, res) => res.json({ success: true, data: await termService.update(req.user, req.params.id, req.body) }));
exports.remove = asyncHandler(async (req, res) => {
  await termService.remove(req.user, req.params.id);
  res.json({ success: true });
});
