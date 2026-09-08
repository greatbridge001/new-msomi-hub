const crypto = require('crypto');
const { query } = require('../config/db');
const { initiateStkPush } = require('../services/payheroService');

const PRICE = () => Number(process.env.SUBSCRIPTION_PRICE || 100);
const VALIDITY_DAYS = () => Number(process.env.SUBSCRIPTION_VALIDITY_DAYS || 365);

function generateReference() {
  return `SFK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * POST /api/payments/subscribe
 * Kicks off an STK push for the one-time subscription fee. The frontend
 * should poll GET /api/payments/status/:reference until it resolves.
 */
async function initiateSubscription(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });

    // Don't let an already-active subscriber pay again
    const existing = await query('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    const sub = existing.rows[0];
    if (sub && sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
      return res.status(409).json({ error: 'You already have an active subscription', expiresAt: sub.expires_at });
    }

    const userResult = await query('SELECT name FROM profiles WHERE id = $1', [req.user.id]);
    const externalReference = generateReference();
    const amount = PRICE();

    // Log the attempt before calling PayHero so the callback always has a row to update
    await query(
      `INSERT INTO payment_transactions (user_id, external_reference, phone_number, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [req.user.id, externalReference, phoneNumber, amount]
    );

    let phResponse;
    try {
      phResponse = await initiateStkPush({
        amount,
        phoneNumber,
        externalReference,
        customerName: userResult.rows[0]?.name || 'StudentFlow User'
      });
    } catch (err) {
      await query(
        `UPDATE payment_transactions SET status = 'failed', result_desc = $1, updated_at = NOW() WHERE external_reference = $2`,
        [err.response?.data?.error || err.message, externalReference]
      );
      const message = err.expose ? err.message : 'Could not reach the payment provider. Please try again.';
      return res.status(502).json({ error: message });
    }

    await query(
      `UPDATE payment_transactions SET checkout_request_id = $1, updated_at = NOW() WHERE external_reference = $2`,
      [phResponse.CheckoutRequestID || null, externalReference]
    );

    res.status(202).json({
      message: 'STK push sent. Enter your M-Pesa PIN on your phone to complete payment.',
      reference: externalReference,
      status: phResponse.status || 'QUEUED'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/status/:reference
 * Frontend polls this after initiating a subscription payment.
 */
async function getPaymentStatus(req, res, next) {
  try {
    const result = await query(
      `SELECT external_reference, status, amount, mpesa_receipt_number, result_desc, created_at
       FROM payment_transactions WHERE external_reference = $1 AND user_id = $2`,
      [req.params.reference, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/subscription
 * Current user's subscription status, for the dashboard paywall banner.
 */
async function getMySubscription(req, res, next) {
  try {
    if (process.env.FREE_MODE === 'true') {
      return res.json({ status: 'active', freeMode: true });
    }

    if (req.user.isAdmin) {
      return res.json({ status: 'active', isAdminBypass: true });
    }

    const result = await query('SELECT * FROM subscriptions WHERE user_id = $1', [req.user.id]);
    const sub = result.rows[0];
    if (!sub) return res.json({ status: 'inactive' });

    if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await query(`UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE user_id = $1`, [req.user.id]);
      return res.json({ status: 'expired', expiresAt: sub.expires_at });
    }

    res.json({ status: sub.status, activatedAt: sub.activated_at, expiresAt: sub.expires_at, amountPaid: sub.amount_paid });
  } catch (err) {
    next(err);
  }
}
/**
 * POST /api/payments/callback
 * Public webhook PayHero calls after the customer completes (or cancels) the
 * STK push. Payload shape per PayHero docs:
 * { forward_url, response: { Amount, CheckoutRequestID, ExternalReference,
 *   MerchantRequestID, MpesaReceiptNumber, Phone, ResultCode, ResultDesc, Status }, status }
 */
async function payheroCallback(req, res, next) {
  try {
    const payload = req.body?.response || req.body;
    const externalReference = payload?.ExternalReference;
    const resultCode = payload?.ResultCode;
    const isSuccess = payload?.Status === 'Success' || resultCode === 0;

    if (!externalReference) {
      console.warn('[payhero callback] missing ExternalReference in payload', req.body);
      return res.status(200).json({ received: true }); // ack anyway so PayHero doesn't retry forever
    }

    const txResult = await query(
      'SELECT * FROM payment_transactions WHERE external_reference = $1',
      [externalReference]
    );
    const tx = txResult.rows[0];
    if (!tx) {
      console.warn('[payhero callback] no matching transaction for reference', externalReference);
      return res.status(200).json({ received: true });
    }

    const newStatus = isSuccess ? 'success' : 'failed';
    await query(
      `UPDATE payment_transactions SET
         status = $1, mpesa_receipt_number = $2, result_desc = $3,
         raw_callback = $4, checkout_request_id = COALESCE(checkout_request_id, $5), updated_at = NOW()
       WHERE external_reference = $6`,
      [newStatus, payload?.MpesaReceiptNumber || null, payload?.ResultDesc || null, JSON.stringify(req.body), payload?.CheckoutRequestID || null, externalReference]
    );

    if (isSuccess) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VALIDITY_DAYS() * 24 * 60 * 60 * 1000);

      await query(
        `INSERT INTO subscriptions (user_id, status, amount_paid, activated_at, expires_at)
         VALUES ($1, 'active', $2, NOW(), $3)
         ON CONFLICT (user_id) DO UPDATE SET
           status = 'active', amount_paid = $2, activated_at = NOW(), expires_at = $3, updated_at = NOW()`,
        [tx.user_id, payload?.Amount || tx.amount, expiresAt]
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Always ack 200 to PayHero even on internal error, but log it - we don't
    // want PayHero endlessly retrying a webhook we can't process, and the
    // transaction row still has 'pending' status for manual reconciliation.
    console.error('[payhero callback] error processing callback', err);
    res.status(200).json({ received: true });
  }
}

module.exports = { initiateSubscription, getPaymentStatus, getMySubscription, payheroCallback };
