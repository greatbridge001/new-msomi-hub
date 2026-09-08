const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// Only routes that genuinely need a trusted server survive here now.
// Auth, timetable, GPA, budget, bookmarks, reminders, reminder
// preferences, announcements, HELB, opportunities, inspiration, and the
// dashboard all moved to the frontend calling Supabase (Postgres + Auth)
// directly, protected by Row Level Security instead of Express middleware.
const paymentRoutes = require('./routes/paymentRoutes');
const coffeeRoutes = require('./routes/coffeeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pastPaperRoutes = require('./routes/pastPaperRoutes');
const cronRoutes = require('./routes/cronRoutes');

const app = express();

// --- Security & parsing middleware ---
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '3mb' }));

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true
  })
);

// --- Health check ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- Feature routes (Express's remaining job: PayHero payments, coffee
//     tips, admin ops, past-paper access + Storage signed URLs, cron) ---
app.use('/api/payments', paymentRoutes);
app.use('/api/coffee', coffeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pastpapers', pastPaperRoutes);
app.use('/api/cron', cronRoutes);

// --- 404 + error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
