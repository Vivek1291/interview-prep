const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { authenticate, requireAdmin } = require('../middleware/auth');
const s = require('../validators/schemas');
const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const sections = require('../controllers/sectionController');
const questions = require('../controllers/questionController');
const admin = require('../controllers/adminController');
const imports = require('../controllers/importController');
const terms = require('../controllers/termController');
const ai = require('../controllers/aiController');

// Router-level middleware / routes. Mounted at /api/v1 (API versioning) and /api.
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Auth (public) ----
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,                                  // 20 attempts per IP per 15 minutes
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !config.rateLimit,
  handler: (req, res) => res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' }),
});
router.post('/auth/register', authLimiter, validate(s.register), auth.register);
router.post('/auth/login', authLimiter, validate(s.login), auth.login);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/logout', auth.logout);

// ---- Everything below needs a logged-in user ----
router.use(authenticate);
router.get('/auth/me', auth.me);

// My account
router.patch('/users/me', validate(s.profileUpdate), users.updateProfile);
router.put('/users/me/password', validate(s.passwordChange), users.changePassword);
router.post('/users/me/avatar', upload.avatarUpload.single('avatar'), users.setAvatar);
router.delete('/users/me/avatar', users.removeAvatar);

// Tree (categories, any depth)
router.get('/sections', sections.getTree);
router.post('/sections', validate(s.sectionCreate), sections.create);
router.patch('/sections/reorder', validate(s.reorder), sections.reorder); // must be before /:id
router.get('/sections/:id', sections.get);
router.put('/sections/:id', validate(s.sectionUpdate), sections.update);
router.delete('/sections/:id', sections.remove);

// Pages
router.get('/questions', questions.list);
router.patch('/questions/reorder', validate(s.reorder), questions.reorder);
router.get('/questions/:id', questions.getById);
router.post('/questions', validate(s.questionCreate), questions.create);
router.put('/questions/:id', validate(s.questionUpdate), questions.update);
router.delete('/questions/:id', questions.remove);
router.post('/questions/:id/quick-notes', validate(s.noteCreate), questions.addAuthorNote);
router.delete('/questions/:id/quick-notes/:noteId', questions.removeAuthorNote);

// My progress (status, star, personal notes) on any visible page
router.put('/questions/:id/progress', validate(s.progressUpdate), questions.setProgress);
router.post('/questions/:id/my-notes', validate(s.noteCreate), questions.addMyNote);
router.delete('/questions/:id/my-notes/:noteId', questions.removeMyNote);
router.get('/quick-notes', questions.revise);

// Images inside pages
router.post('/uploads', upload.single('file'), admin.upload);

// AI assistant: more detail on a page / term / selection, saved as a page if wanted
router.get('/ai/status', ai.status);
router.post('/ai/ask', validate(s.aiAsk), ai.ask);
router.post('/ai/preview', validate(s.aiPreview), ai.preview);
router.post('/ai/save', validate(s.aiSave), ai.save);

// Glossary terms (shared or private), linked automatically inside pages
router.get('/terms', terms.list);
router.post('/terms', validate(s.termCreate), terms.create);
router.get('/terms/:id', terms.get);
router.put('/terms/:id', validate(s.termUpdate), terms.update);
router.delete('/terms/:id', terms.remove);

// Import a prepared document (.docx upload or Google Docs link) as categories + pages
router.post('/imports', upload.documentUpload.single('file'), imports.start);
router.post('/imports/:id/preview', validate(s.importPreview), imports.preview);
router.post('/imports/:id/commit', validate(s.importCommit), imports.commit);
router.post('/imports/:id/commit-tabs', validate(s.importCommitTabs), imports.commitTabs);
router.get('/imports/:id/status', imports.status);
router.post('/imports/:id/whole-document', imports.useWholeDocument);
router.post('/imports/:id/tabs', imports.useTabs);
router.delete('/imports/:id', imports.cancel);

// ---- Admin ----
router.get('/admin/users', requireAdmin, users.list);
router.get('/admin/ai', requireAdmin, ai.getSettings);
router.put('/admin/ai', requireAdmin, validate(s.aiSettings), ai.saveSettings);
router.post('/admin/ai/providers/:id/test', requireAdmin, ai.test);
router.patch('/admin/users/:id', requireAdmin, validate(s.roleUpdate), users.setRole);
router.get('/backup/export', requireAdmin, admin.exportAll);
router.post('/backup/import', requireAdmin, admin.importAll);
router.post('/backup/reset', requireAdmin, admin.reset);

module.exports = router;
