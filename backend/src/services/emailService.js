const nodemailer = require('nodemailer');

/**
 * Plain SMTP email sender. Works with any SMTP provider - Gmail (with an App
 * Password), Zoho Mail, Brevo, or a transactional service like Resend/SES's
 * SMTP endpoint. No provider-specific SDK needed, so it's easy to swap later.
 *
 * Env vars required in production:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const emailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (emailConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
} else {
  console.warn('[email] SMTP_* env vars not set - email reminders are disabled (SMS will still work).');
}

/**
 * Sends a single email.
 * @param {string} to
 * @param {string} subject
 * @param {string} text - plain text body
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendEmail(to, subject, text) {
  if (!emailConfigured) {
    return { ok: false, error: 'Email provider not configured' };
  }
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, emailConfigured };
