// Overenie volania z Backendu 2: hlavička X-Internal-Key = INTERNAL_API_KEY.

const crypto = require('node:crypto');
const config = require('../config/env');
const HttpError = require('../utils/httpError');

function requireInternalKey(req, res, next) {
  if (!config.internalApiKey) {
    return next(new HttpError(503, 'Interné API nie je nakonfigurované (INTERNAL_API_KEY)'));
  }
  const given = Buffer.from(req.get('X-Internal-Key') || '');
  const expected = Buffer.from(config.internalApiKey);
  // porovnanie v konštantnom čase – dĺžka sa porovná zvlášť (timingSafeEqual ju vyžaduje rovnakú)
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return next(new HttpError(403, 'Neplatný interný kľúč'));
  }
  next();
}

module.exports = { requireInternalKey };
