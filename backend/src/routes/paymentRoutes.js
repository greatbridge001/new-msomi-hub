const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const payments = require('../controllers/paymentController');

const router = express.Router();

const payLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please wait a few minutes and try again.' }
});

router.get('/subscription', requireAuth, payments.getMySubscription);
router.post('/subscribe', requireAuth, payLimiter, payments.initiateSubscription);
router.get('/status/:reference', requireAuth, payments.getPaymentStatus);

// Public webhook - PayHero calls this directly, no user session available.
// Not behind requireAuth. Consider restricting by source IP at the reverse
// proxy / firewall level in production for extra safety.
router.post('/callback', payments.payheroCallback);

module.exports = router;
