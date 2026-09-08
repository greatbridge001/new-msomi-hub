const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requirePastPaperAccess } = require('../middleware/pastPaperAccess');
const papers = require('../controllers/pastPaperController');
const payments = require('../controllers/pastPaperPaymentController');

const router = express.Router();

// Files go straight into memory then to Supabase Storage - never touch
// disk, and never sit around on the server. 25MB/file covers a
// multi-page scanned exam comfortably; raise it if your uploads are larger.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// --- Payment / access status ---
router.get('/access', requireAuth, payments.getMyAccess);
router.post('/unlock', requireAuth, payments.initiateUnlock);
router.get('/unlock/status/:reference', requireAuth, payments.getUnlockStatus);

// Public webhook - PayHero calls this directly, no user session available.
router.post('/callback', payments.payheroPastPaperCallback);

// --- Content ---
router.get('/meta', requireAuth, papers.meta);
router.get('/', requireAuth, requirePastPaperAccess, papers.list);

// View/download a specific paper's files - the paywall gate lives here too,
// since this is the endpoint that actually reveals file access.
router.get('/:id/access-url', requireAuth, requirePastPaperAccess, papers.getAccessUrl);

// Admin-only writes.
router.post('/', requireAuth, requireAdmin, upload.array('files', 20), papers.create);
router.put('/:id', requireAuth, requireAdmin, upload.array('files', 20), papers.update);
router.delete('/:id', requireAuth, requireAdmin, papers.remove);

module.exports = router;
