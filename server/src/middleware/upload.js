const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const ApiError = require('../utils/ApiError');

const avatarDir = path.join(config.uploadDir, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

// never trust the client file name — generate our own
const randomName = (file) => `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;

const imageFilter = (allowed) => (req, file, cb) =>
  allowed.includes(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest(`Only ${allowed.map((t) => t.split('/')[1]).join(', ')} images are allowed`));

// Images inside page content (any logged-in user)
const upload = multer({
  storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, config.uploadDir), filename: (req, file, cb) => cb(null, randomName(file)) }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: imageFilter(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']),
});

// Profile pictures: small, and no SVG (SVG files can contain scripts)
const avatarUpload = multer({
  storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, avatarDir), filename: (req, file, cb) => cb(null, randomName(file)) }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: imageFilter(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
});

// Documents to import (.docx): kept in memory, parsed, never stored as uploaded
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 1 }, // 60 MB (documents with many images)
});

module.exports = upload;
module.exports.avatarUpload = avatarUpload;
module.exports.documentUpload = documentUpload;
