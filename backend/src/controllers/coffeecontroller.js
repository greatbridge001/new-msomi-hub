const crypto = require('crypto');
const { query } = require('../config/db');
const { initiateStkPush } = require('../services/payheroService');

function generateReference() {
  return `COFFEE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * POST /api/coffee/tip
 * Public, no login required - anyone (student or visitor) can send an
 * M-Pesa tip of any amount. Not tied to a user account.
 */
async function initiateTip(req, res, next) {
  try {
    const { phoneNumber, amount, supporterName } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    const tipAmount = Number(amount);
    if (!tipAmount || tipAmount <= 0) {
      return res.status(400).json({ error: 'A valid amount greater than 0 is required' });
    }

    const externalReference = generateReference();

    await query(
      `INSERT INTO coffee_tips (supporter_name, phone_number, amount, external_reference, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [supporterName || null, phoneNumber, tipAmount, externalReference]
    );

    let phResponse;
    try {
      phResponse = await initiateStkPush({
        amount: tipAmount,
        phoneNumber,
        externalReference,
        customerName: supporterName || 'Msomi Hub Supporter',
        // Separate env var so coffee tip completions land on /api/coffee/callback
        // instead of colliding with the subscription payment webhook. Falls back
        // to the shared PAYHERO_CALLBACK_URL if a dedicated one isn't set, so
        // this keeps working even before the new env var is configured.
        callbackUrl: process.env.PAYHERO_COFFEE_CALLBACK_URL || process.env.PAYHERO_CALLBACK_URL
      });
    } catch (err) {
      await query(
        `UPDATE coffee_tips SET status = 'failed', result_desc = $1, updated_at = NOW() WHERE external_reference = $2`,
        [err.response?.data?.error || err.message, externalReference]
      );
      const message = err.expose ? err.message : 'Could not reach the payment provider. Please try again.';
      return res.status(502).json({ error: message });
    }

    await query(
      `UPDATE coffee_tips SET checkout_request_id = $1, updated_at = NOW() WHERE external_reference = $2`,
      [phResponse.CheckoutRequestID || null, externalReference]
    );

    res.status(202).json({
      message: 'STK push sent. Enter your M-Pesa PIN to complete your tip. Thank you!',
      reference: externalReference,
      status: phResponse.status || 'QUEUED'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/coffee/status/:reference
 * Public - frontend polls this after initiating a tip.
 */
async function getTipStatus(req, res, next) {
  try {
    const result = await query(
      `SELECT external_reference, status, amount, mpesa_receipt_number, result_desc, created_at
       FROM coffee_tips WHERE external_reference = $1`,
      [req.params.reference]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tip not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/coffee/callback
 * Public webhook PayHero calls after the tipper completes (or cancels) the
 * STK push. Same payload shape as the subscription callback.
 */
async function payheroCoffeeCallback(req, res, next) {
  try {
    const payload = req.body?.response || req.body;
    const externalReference = payload?.ExternalReference;
    const resultCode = payload?.ResultCode;
    const isSuccess = payload?.Status === 'Success' || resultCode === 0;

    if (!externalReference) {
      console.warn('[coffee callback] missing ExternalReference in payload', req.body);
      return res.status(200).json({ received: true });
    }

    const newStatus = isSuccess ? 'success' : 'failed';
    await query(
      `UPDATE coffee_tips SET
         status = $1, mpesa_receipt_number = $2, result_desc = $3,
         raw_callback = $4, checkout_request_id = COALESCE(checkout_request_id, $5), updated_at = NOW()
       WHERE external_reference = $6`,
      [newStatus, payload?.MpesaReceiptNumber || null, payload?.ResultDesc || null, JSON.stringify(req.body), payload?.CheckoutRequestID || null, externalReference]
    );

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[coffee callback] error processing callback', err);
    res.status(200).json({ received: true });
  }
}

module.exports = { initiateTip, getTipStatus, payheroCoffeeCallback };