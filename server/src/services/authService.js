const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { secrets } = require('../config/secrets');
const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/userRepository');
const progressRepository = require('../repositories/progressRepository');
const Meta = require('../models/Meta');

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);   // same bcrypt cost whether or not the user exists

const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, secrets().access, { algorithm: 'HS256', expiresIn: config.accessTtl });

/** Issue a new session: short-lived access token + a refresh token whose id is the only valid one (rotation). */
async function issueSession(user) {
  const jti = crypto.randomUUID();
  await userRepository.update(user._id, { $set: { refreshJti: jti } });
  const refreshToken = jwt.sign({ sub: String(user._id), jti }, secrets().refresh, { algorithm: 'HS256', expiresIn: `${config.refreshTtlDays}d` });
  return { accessToken: signAccess(user), refreshToken, user: user.toPublic() };
}

/** The very first account becomes admin. Meta._id is unique, so two simultaneous sign-ups can't both win. */
async function claimFirstAdmin() {
  try {
    await Meta.create({ _id: 'firstAdmin', value: true });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

/** Give the first admin the status/stars that existed before accounts were added (see seed/migrate.js). */
async function claimLegacyProgress(userId) {
  const stash = await Meta.findById('legacyProgress').lean();
  if (!stash?.value?.length) return 0;
  await progressRepository.insertMany(stash.value.map((p) => ({ user: userId, question: p.question, status: p.status, starred: p.starred })));
  await Meta.deleteOne({ _id: 'legacyProgress' });
  return stash.value.length;
}

const authService = {
  async register({ name, email, password }) {
    if (await userRepository.findByEmail(email)) throw ApiError.conflict('An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const isFirst = await claimFirstAdmin();
    const user = await userRepository.create({ name, email, passwordHash, role: isFirst ? 'admin' : 'user' });
    if (isFirst) await claimLegacyProgress(user._id);
    return issueSession(user);
  },

  async login({ email, password }) {
    const user = await userRepository.findByEmail(email, true);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw ApiError.unauthorized('Email or password is wrong', 'INVALID_CREDENTIALS');
    return issueSession(user);
  },

  async refresh(token) {
    if (!token) throw ApiError.unauthorized('Please log in', 'NO_SESSION');
    let payload;
    try {
      payload = jwt.verify(token, secrets().refresh, { algorithms: ['HS256'] });
    } catch {
      throw ApiError.unauthorized('Please log in', 'NO_SESSION');
    }
    const user = await userRepository.findById(payload.sub, true);
    if (!user || user.refreshJti !== payload.jti) {
      // An already-rotated token was used again: possible theft → end the session everywhere.
      if (user) await userRepository.update(user._id, { $unset: { refreshJti: '' } });
      throw ApiError.unauthorized('Session ended, please log in again', 'REFRESH_REUSED');
    }
    return issueSession(user);
  },

  /** New session for an existing user (e.g. this device after a password change, which revokes all others). */
  async sessionFor(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.unauthorized('Account not found');
    return issueSession(user);
  },

  async logout(token) {
    const payload = token ? jwt.decode(token) : null;
    if (payload?.sub) await userRepository.update(payload.sub, { $unset: { refreshJti: '' } });
  },
};

module.exports = authService;
