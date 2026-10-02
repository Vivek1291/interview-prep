const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const adminService = require('../services/adminService');

exports.exportAll = asyncHandler(async (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="learning-hub-backup-${Date.now()}.json"`);
  res.json(await adminService.exportShared());
});

exports.importAll = asyncHandler(async (req, res) => res.json({ success: true, ...(await adminService.importShared(req.body || {})) }));
exports.reset = asyncHandler(async (req, res) => res.json({ success: true, ...(await adminService.reset()) }));

exports.upload = (req, res, next) => {
  if (!req.file) return next(ApiError.badRequest('No file uploaded (field name must be "file")'));
  res.status(201).json({ success: true, url: `/uploads/${path.basename(req.file.path)}` });
};
