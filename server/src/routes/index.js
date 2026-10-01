const express = require('express');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const s = require('../validators/schemas');
const sections = require('../controllers/sectionController');
const questions = require('../controllers/questionController');
const admin = require('../controllers/adminController');

// Router-level middleware / routes. Mounted at /api/v1 (API versioning) and /api.
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Sections
router.get('/sections', sections.getTree);
router.post('/sections', validate(s.sectionCreate), sections.create);
router.patch('/sections/reorder', validate(s.reorder), sections.reorder); // must be before /:id
router.put('/sections/:id', validate(s.sectionUpdate), sections.update);
router.delete('/sections/:id', sections.remove);

// Questions
router.get('/questions', questions.list);
router.patch('/questions/reorder', validate(s.reorder), questions.reorder);
router.get('/questions/:id', questions.getById);
router.post('/questions', validate(s.questionCreate), questions.create);
router.put('/questions/:id', validate(s.questionUpdate), questions.update);
router.delete('/questions/:id', questions.remove);
router.post('/questions/:id/quick-notes', validate(s.quickNoteCreate), questions.addQuickNote);
router.delete('/questions/:id/quick-notes/:noteId', questions.removeQuickNote);

// Revision + stats
router.get('/quick-notes', questions.quickNotes);
router.get('/stats', questions.stats);

// Uploads + backup
router.post('/uploads', upload.single('file'), admin.upload);
router.get('/backup/export', admin.exportAll);
router.post('/backup/import', admin.importAll);
router.post('/backup/reset', admin.reset);

module.exports = router;
