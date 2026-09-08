const axios = require('axios');

const PAYHERO_BASE_URL = 'https://backend.payhero.co.ke/api/v2';

function getAuthHeader() {
  const { PAYHERO_API_USERNAME, PAYHERO_API_PASSWORD } = process.env;
  if (!PAYHERO_API_USERNAME || !PAYHERO_API_PASSWORD) {
    throw new Error('PAYHERO_API_USERNAME / PAYHERO_API_PASSWORD are not configured');
  }
  const token = Buffer.from(`${PAYHERO_API_USERNAME}:${PAYHERO_API_PASSWORD}`).toString('base64');
  return `Basic ${token}`;
}

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX / 2541XXXXXXXX format
 * PayHero/M-Pesa expects, accepting 07.., 01.., +254.., or 254.. input.
 */
function normalizePhone(input) {
  const digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw Object.assign(new Error('Enter a valid Kenyan phone number, e.g. 0712345678'), { status: 400, expose: true });
}

/**
 * Initiates an MPESA STK push via PayHero.
 * Docs: POST https://backend.payhero.co.ke/api/v2/payments
 * Returns { success, status: 'QUEUED', reference, CheckoutRequestID }
 *
 * IMPORTANT: pass callbackUrl explicitly per flow (subscription vs coffee
 * tip) - each flow has its own webhook route, and PayHero will only ever hit
 * the single URL you send it here. Falling back to a single shared
 * PAYHERO_CALLBACK_URL env var for every flow means only one of them ever
 * gets its completion webhook.
 */
async function initiateStkPush({ amount, phoneNumber, externalReference, customerName, callbackUrl }) {
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  if (!channelId) throw new Error('PAYHERO_CHANNEL_ID is not configured');

  const resolvedCallbackUrl = callbackUrl || process.env.PAYHERO_CALLBACK_URL;
  if (!resolvedCallbackUrl) throw new Error('No PayHero callback URL configured for this payment flow');

  const payload = {
    amount,
    phone_number: normalizePhone(phoneNumber),
    channel_id: Number(channelId),
    provider: 'm-pesa',
    external_reference: externalReference,
    customer_name: customerName,
    callback_url: resolvedCallbackUrl
  };

  const { data } = await axios.post(`${PAYHERO_BASE_URL}/payments`, payload, {
    headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
    timeout: 15000
  });

  return data; // { success, status, reference, CheckoutRequestID }
}

module.exports = { initiateStkPush, normalizePhone };