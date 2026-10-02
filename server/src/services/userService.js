const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/userRepository');

const AVATAR_PREFIX = '/uploads/avatars/';

async function deleteAvatarFile(url) {
  if (!url?.startsWith(AVATAR_PREFIX)) return;
  const file = path.join(config.uploadDir, 'avatars', path.basename(url));   // basename: no path traversal
  await fs.unlink(file).catch(() => {});
}

const userService = {
  async me(userId) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.unauthorized('Account not found');
    return user.toPublic();
  },

  async updateProfile(userId, { name }) {
    const user = await userRepository.update(userId, { $set: { name } });
    if (!user) throw ApiError.notFound('Account not found');
    return user.toPublic();
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId, true);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is wrong', [{ path: 'currentPassword', message: 'Current password is wrong' }]);
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await userRepository.update(userId, { $set: { passwordHash }, $unset: { refreshJti: '' } });   // log out other sessions
  },

  async setAvatar(userId, file) {
    if (!file) throw ApiError.badRequest('No image uploaded (field name must be "avatar")');
    const before = await userRepository.findById(userId);
    const user = await userRepository.update(userId, { $set: { avatarUrl: `${AVATAR_PREFIX}${path.basename(file.path)}` } });
    await deleteAvatarFile(before?.avatarUrl);
    return user.toPublic();
  },

  async removeAvatar(userId) {
    const before = await userRepository.findById(userId);
    const user = await userRepository.update(userId, { $set: { avatarUrl: '' } });
    await deleteAvatarFile(before?.avatarUrl);
    return user.toPublic();
  },

  // ---- admin ----
  list: async () => (await userRepository.list()).map(({ passwordHash, refreshJti, __v, ...u }) => u),

  async setRole(actorId, targetId, role) {
    if (String(actorId) === String(targetId) && role !== 'admin' && (await userRepository.count({ role: 'admin' })) <= 1) {
      throw ApiError.badRequest('You are the only admin: promote someone else first');
    }
    const user = await userRepository.update(targetId, { $set: { role } });   // applies on their next request
    if (!user) throw ApiError.notFound('User not found');
    return user.toPublic();
  },
};

module.exports = userService;
