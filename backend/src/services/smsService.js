const axios = require('axios');

/**
 * Thin wrapper around Africa's Talking's SMS API (the standard choice for
 * Kenyan apps - cheap per-SMS pricing, no per-message approval process like
 * some global providers require, and a free sandbox for development).
 *
 * Env vars required in production:
 *   AT_USERNAME   - your Africa's Talking application username
 *   AT_API_KEY    - the app's API key (Settings > API Key in the AT console)
 *   AT_SENDER_ID  - optional registered short code / sender ID
 *
 * For local development, leave AT_USERNAME as "sandbox" (the default AT
 * gives every account) and point AT_BASE_URL at the sandbox host - see
 * .env.example. No real SMS is sent from the sandbox; it just logs deliveries
 * in the AT dashboard, which is enough to verify the integration works.
 */
const AT_USERNAME = process.env.AT_USERNAME;
const AT_API_KEY = process.env.AT_API_KEY;
const AT_SENDER_ID = process.env.AT_SENDER_ID || undefined;
const AT_BASE_URL =
  process.env.AT_BASE_URL ||
  (AT_USERNAME === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging');

const smsConfigured = Boolean(AT_USERNAME && AT_API_KEY);

if (!smsConfigured) {
  console.warn('[sms] AT_USERNAME/AT_API_KEY not set - SMS reminders are disabled (email will still work).');
}

/**
 * Sends a single SMS.
 * @param {string} to - E.164 number, e.g. +2547XXXXXXXX
 * @param {string} message
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendSms(to, message) {
  if (!smsConfigured) {
    return { ok: false, error: 'SMS provider not configured' };
  }
  try {
    const params = new URLSearchParams();
    params.append('username', AT_USERNAME);
    params.append('to', to);
    params.append('message', message);
    if (AT_SENDER_ID) params.append('from', AT_SENDER_ID);

    const response = await axios.post(AT_BASE_URL, params, {
      headers: {
        apiKey: AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      timeout: 10000
    });

    const recipient = response.data?.SMSMessageData?.Recipients?.[0];
    if (recipient && recipient.status !== 'Success') {
      return { ok: false, error: recipient.status };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.response?.data?.SMSMessageData || err.message };
  }
}

module.exports = { sendSms, smsConfigured };
