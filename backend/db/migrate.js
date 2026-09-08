/**
 * Simple migration runner - applies schema.sql to the configured
 * Supabase Postgres database. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
 *
 * Usage: npm run db:migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    console.log('Applying schema.sql to database...');
    await pool.query(sql);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
