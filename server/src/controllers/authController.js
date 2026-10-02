const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const authService = require('../services/authService');
const userService = require('../services/userService');

const COOKIE = 'rt';
const cookieOptions = () => ({
  httpOnly: true,                     // JavaScript can't read it, so XSS can't steal it
  secure: config.cookieSecure,        // HTTPS-only when the app is served over TLS
  sameSite: 'lax',                    // not sent on cross-site POSTs (CSRF)
  path: '/api/auth',                  // only sent to the auth endpoints
  maxAge: config.refreshTtlDays * 24 * 3600 * 1000,
});

function sendSession(res, status, { accessToken, refreshToken, user }) {
  res.cookie(COOKIE, refreshToken, cookieOptions());
  res.status(status).json({ success: true, accessToken, user });
}
exports.sendSession = (res, status, session) => sendSession(res, status, session);
const clearCookie = (res) => res.clearCookie(COOKIE, { path: '/api/auth' });

exports.register = asyncHandler(async (req, res) => sendSession(res, 201, await authService.register(req.body)));
exports.login = asyncHandler(async (req, res) => sendSession(res, 200, await authService.login(req.body)));

exports.refresh = asyncHandler(async (req, res) => {
  try {
    sendSession(res, 200, await authService.refresh(req.cookies[COOKIE]));
  } catch (err) {
    clearCookie(res);
    throw err;
  }
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[COOKIE]);
  clearCookie(res);
  res.status(204).end();
});

exports.me = asyncHandler(async (req, res) => res.json({ success: true, user: await userService.me(req.user.id) }));
