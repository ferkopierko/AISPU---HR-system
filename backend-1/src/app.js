const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const db = require('./db/azureSql');
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const adminJobRoutes = require('./routes/adminJobs');
const internalRoutes = require('./routes/internal');
const systemRoutes = require('./routes/system');
const reviewSummaryRoutes = require('./routes/reviewSummary');
const { refreshSessionRole } = require('./middleware/auth');
const { portalSession } = require('./middleware/session');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (config.isProduction) {
  app.set('trust proxy', 1); // za reverznou proxy Azure – kvôli secure cookie
}

app.use(cors({
  origin: config.corsOrigin,
  credentials: true, // povoliť session cookie z frontendu
}));
// Session podľa portálu (X-Client-App), uložená v dbo.sessions – pozri middleware/session.js.
app.use(portalSession);

// Interné API pre Backend 2 – vlastný JSON parser s vyšším limitom (CV v base64),
// preto musí byť pred globálnym parserom.
app.use(refreshSessionRole);
app.use('/api/internal', internalRoutes);
app.use(express.json({ limit: '100kb' }));

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
app.use('/api/admin/jobs', adminJobRoutes);
app.use('/api/admin/applications', reviewSummaryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/system', systemRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
