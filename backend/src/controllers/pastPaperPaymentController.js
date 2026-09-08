const crypto = require('crypto');
const { query } = require('../config/db');
const { initiateStkPush } = require('../services/payheroService');

const PRICE = () => Number(process.env.PASTPAPER_PRICE || 50);
const VALIDITY_DAYS = () => Number(process.env.PASTPAPER_VALIDITY_DAYS || 130); // ~1 semester

function generateReference() {
  return `PPR-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * POST /api/pastpapers/unlock
 * Kicks off an STK push for the KES 50 semester unlock. Frontend polls
 * GET /api/pastpapers/unlock/status/:reference until it resolves.
 */
async function initiateUnlock(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    const existing = await query('SELECT * FROM past_paper_access WHERE user_id = $1', [req.user.id]);
    const access = existing.rows[0];
    if (access && access.status === 'active' && access.expires_at && new Date(access.expires_at) > new Date()) {
      return res.status(409).json({ error: 'You already have active revision materials access', expiresAt: access.expires_at });
    }

    const userResult = await query('SELECT name FROM profiles WHERE id = $1', [req.user.id]);
    const externalReference = generateReference();
    const amount = PRICE();

    await query(
      `INSERT INTO past_paper_transactions (user_id, external_reference, phone_number, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [req.user.id, externalReference, phoneNumber, amount]
    );

    let phResponse;
    try {
      phResponse = await initiateStkPush({
        amount,
        phoneNumber,
        externalReference,
        customerName: userResult.rows[0]?.name || 'Msomi Hub Student',
        // Own callback URL, same reasoning as the coffee tip flow - keeps
        // this completion from colliding with the main subscription webhook.
        callbackUrl: process.env.PAYHERO_PASTPAPER_CALLBACK_URL || process.env.PAYHERO_CALLBACK_URL
      });
    } catch (err) {
      await query(
        `UPDATE past_paper_transactions SET status = 'failed', result_desc = $1, updated_at = NOW() WHERE external_reference = $2`,
        [err.response?.data?.error || err.message, externalReference]
      );
      const message = err.expose ? err.message : 'Could not reach the payment provider. Please try again.';
      return res.status(502).json({ error: message });
    }

    await query(
      `UPDATE past_paper_transactions SET checkout_request_id = $1, updated_at = NOW() WHERE external_reference = $2`,
      [phResponse.CheckoutRequestID || null, externalReference]
    );

    res.status(202).json({
      message: 'STK push sent. Enter your M-Pesa PIN to unlock revision materials.',
      reference: externalReference,
      status: phResponse.status || 'QUEUED'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pastpapers/unlock/status/:reference
 */
async function getUnlockStatus(req, res, next) {
  try {
    const result = await query(
      `SELECT external_reference, status, amount, mpesa_receipt_number, result_desc, created_at
       FROM past_paper_transactions WHERE external_reference = $1 AND user_id = $2`,
      [req.params.reference, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pastpapers/access
 * Current user's revision-materials access status, for the paywall banner.
 */
async function getMyAccess(req, res, next) {
  try {
    if (process.env.FREE_MODE === 'true') {
      return res.json({ status: 'active', freeMode: true });
    }
    if (req.user.isAdmin) {
      return res.json({ status: 'active', isAdminBypass: true });
    }

    const result = await query('SELECT * FROM past_paper_access WHERE user_id = $1', [req.user.id]);
    const access = result.rows[0];
    if (!access) return res.json({ status: 'inactive' });

    if (access.status === 'active' && access.expires_at && new Date(access.expires_at) < new Date()) {
      await query(`UPDATE past_paper_access SET status = 'expired', updated_at = NOW() WHERE user_id = $1`, [req.user.id]);
      return res.json({ status: 'expired', expiresAt: access.expires_at });
    }

    res.json({ status: access.status, activatedAt: access.activated_at, expiresAt: access.expires_at, amountPaid: access.amount_paid });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pastpapers/callback
 * Public webhook - PayHero calls this after the STK push resolves.
 */
async function payheroPastPaperCallback(req, res, next) {
  try {
    const payload = req.body?.response || req.body;
    const externalReference = payload?.ExternalReference;
    const resultCode = payload?.ResultCode;
    const isSuccess = payload?.Status === 'Success' || resultCode === 0;

    if (!externalReference) {
      console.warn('[pastpaper callback] missing ExternalReference in payload', req.body);
      return res.status(200).json({ received: true });
    }

    const txResult = await query(
      'SELECT * FROM past_paper_transactions WHERE external_reference = $1',
      [externalReference]
    );
    const tx = txResult.rows[0];
    if (!tx) {
      console.warn('[pastpaper callback] no matching transaction for reference', externalReference);
      return res.status(200).json({ received: true });
    }

    const newStatus = isSuccess ? 'success' : 'failed';
    await query(
      `UPDATE past_paper_transactions SET
         status = $1, mpesa_receipt_number = $2, result_desc = $3,
         raw_callback = $4, checkout_request_id = COALESCE(checkout_request_id, $5), updated_at = NOW()
       WHERE external_reference = $6`,
      [newStatus, payload?.MpesaReceiptNumber || null, payload?.ResultDesc || null, JSON.stringify(req.body), payload?.CheckoutRequestID || null, externalReference]
    );

    if (isSuccess) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VALIDITY_DAYS() * 24 * 60 * 60 * 1000);

      await query(
        `INSERT INTO past_paper_access (user_id, status, amount_paid, activated_at, expires_at)
         VALUES ($1, 'active', $2, NOW(), $3)
         ON CONFLICT (user_id) DO UPDATE SET
           status = 'active', amount_paid = $2, activated_at = NOW(), expires_at = $3, updated_at = NOW()`,
        [tx.user_id, payload?.Amount || tx.amount, expiresAt]
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[pastpaper callback] error processing callback', err);
    res.status(200).json({ received: true });
  }
}

module.exports = { initiateUnlock, getUnlockStatus, getMyAccess, payheroPastPaperCallback };