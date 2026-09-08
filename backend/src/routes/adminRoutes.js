const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const admin = require('../controllers/adminController');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', admin.getStats);
router.get('/users', admin.listUsers);
router.patch('/users/:id', admin.updateUser);
router.get('/transactions', admin.listTransactions);
router.get('/referral-leaderboard', admin.referralLeaderboard);

module.exports = router;
