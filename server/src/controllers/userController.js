const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/userService');
const authService = require('../services/authService');
const { sendSession } = require('./authController');

exports.updateProfile = asyncHandler(async (req, res) => res.json({ success: true, user: await userService.updateProfile(req.user.id, req.body) }));

// Changing the password logs out every other device; this device gets a fresh session.
exports.changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.body);
  sendSession(res, 200, await authService.sessionFor(req.user.id));
});

exports.setAvatar = asyncHandler(async (req, res) => res.json({ success: true, user: await userService.setAvatar(req.user.id, req.file) }));
exports.removeAvatar = asyncHandler(async (req, res) => res.json({ success: true, user: await userService.removeAvatar(req.user.id) }));

exports.list = asyncHandler(async (req, res) => res.json({ success: true, data: await userService.list() }));
exports.setRole = asyncHandler(async (req, res) =>
  res.json({ success: true, user: await userService.setRole(req.user.id, req.params.id, req.body.role) }));
