const express = require('express');
const rateLimit = require('express-rate-limit');
const coffee = require('../controllers/coffeecontroller');

const router = express.Router();

// Same shape as the subscription payment limiter - prevents abuse of the
// public STK push endpoint (no auth required for tips).
const tipLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many tip attempts. Please wait a few minutes and try again.' }
});

// Public - no requireAuth, anyone (logged in or not) can send a tip.
router.post('/tip', tipLimiter, coffee.initiateTip);
router.get('/status/:reference', coffee.getTipStatus);

// Public webhook - PayHero calls this directly, no user session available.
router.post('/callback', coffee.payheroCoffeeCallback);

module.exports = router;