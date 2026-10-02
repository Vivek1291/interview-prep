const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { secrets } = require('../config/secrets');
const User = require('../models/User');

// Who are you? Reads "Authorization: Bearer <access token>" → req.user = { id, role }.
// The role is read from the database (one indexed lookup) so promotions/demotions apply immediately.
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, secrets().access, { algorithms: ['HS256'] });
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return next(ApiError.unauthorized(expired ? 'Session expired' : 'Invalid token', expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'));
  }
  try {
    const user = await User.findById(payload.sub).select('role').lean();
    if (!user) return next(ApiError.unauthorized('Account not found', 'INVALID_TOKEN'));
    req.user = { id: String(user._id), role: user.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(ApiError.forbidden('Admins only')));

module.exports = { authenticate, requireAdmin };
