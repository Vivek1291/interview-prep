// Import a prepared document as categories + pages (see services/importService.js).
const asyncHandler = require('../utils/asyncHandler');
const importService = require('../services/importService');
const ApiError = require('../utils/ApiError');
const { importStart } = require('../validators/schemas');

exports.start = asyncHandler(async (req, res) => {
  let url;
  if (!req.file) {
    const parsed = importStart.safeParse(req.body || {});
    if (!parsed.success) throw ApiError.badRequest('Choose a .docx file or paste a Google Docs link');
    ({ url } = parsed.data);
  }
  res.status(201).json({ success: true, data: await importService.start(req.user, { file: req.file, url }) });
});

exports.preview = asyncHandler(async (req, res) => {
  res.json({ success: true, data: importService.preview(req.user, req.params.id, req.body.rule) });
});

exports.commit = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await importService.commit(req.user, req.params.id, req.body) });
});

exports.cancel = asyncHandler(async (req, res) => {
  importService.cancel(req.user, req.params.id);
  res.json({ success: true });
});

exports.commitTabs = asyncHandler(async (req, res) => {
  res.status(202).json({ success: true, data: importService.commitTabs(req.user, req.params.id, req.body) });
});

exports.status = asyncHandler(async (req, res) => {
  res.json({ success: true, data: importService.status(req.user, req.params.id) });
});

exports.useWholeDocument = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await importService.useWholeDocument(req.user, req.params.id) });
});

exports.useTabs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: importService.useTabs(req.user, req.params.id) });
});
