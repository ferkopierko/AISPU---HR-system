const express = require('express');
const session = require('express-session');
const cors = require('cors');
const config = require('./config/env');
const db = require('./db/azureSql');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (config.isProduction) {
  app.set('trust proxy', 1); // za reverznou proxy Azure – kvôli secure cookie
}

app.use(cors({
  origin: config.corsOrigin,
  credentials: true, // povoliť session cookie z frontendu
}));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  name: 'hr.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 1000 * 60 * 60 * 8, // 8 hodín
  },
}));

app.get('/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('[health] DB nedostupná:', err.message);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
