const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[db] WARNING: DATABASE_URL is not set. Set it to your Supabase connection string.');
}

// Use Supabase's connection pooler (port 6543, "Transaction" mode) for
// DATABASE_URL - Express makes short, occasional queries (payments, admin,
// past-paper access, the reminder cron), not long-lived sessions, so the
// pooler is the right fit and avoids exhausting Supabase's direct
// connection limit. Find this string in: Supabase Dashboard -> Project
// Settings -> Database -> Connection string -> "Transaction" mode.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

/**
 * Small query helper so callers don't need to import `pool` everywhere.
 * @param {string} text - SQL text with $1, $2... placeholders
 * @param {Array} params
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
