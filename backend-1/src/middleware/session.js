// Oddelené sessions pre portál uchádzača a HR portál.
//
// Prehliadač zdieľa cookies medzi localhost:5173 a :5174 (port nerozlišuje), preto by
// jedna cookie znamenala, že prihlásenie HR odhlási uchádzača v tom istom prehliadači.
// Frontend (nginx / Azure server) posiela hlavičku X-Client-App a podľa nej sa použije:
//   candidate -> cookie sr.candidate.sid
//   hr        -> cookie sr.hr.sid
//   bez hlavičky -> cookie hr.sid – iba interné volania z Backendu 2, ktorý preposiela
//                   session pod týmto menom (nginx mu ju pri /api/ml premenuje).
// Všetky tri inštancie zdieľajú jedno úložisko (dbo.sessions) aj tajomstvo,
// takže session nájdená cez hr.sid je tá istá ako v portáli.

const session = require('express-session');
const config = require('../config/env');
const { MssqlSessionStore } = require('../db/sessionStore');

const CLIENT_APPS = ['candidate', 'hr'];
const COOKIE_NAMES = { candidate: 'sr.candidate.sid', hr: 'sr.hr.sid', internal: 'hr.sid' };

const store = new MssqlSessionStore();
const cookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  maxAge: 1000 * 60 * 60 * 8, // 8 hodín
};

const middlewares = Object.fromEntries(
  Object.entries(COOKIE_NAMES).map(([key, name]) => [
    key,
    session({ name, store, secret: config.sessionSecret, resave: false, saveUninitialized: false, cookie }),
  ])
);

/** Vyberie session podľa X-Client-App; req.clientApp = 'candidate' | 'hr' | null. */
function portalSession(req, res, next) {
  const header = req.get('X-Client-App');
  req.clientApp = CLIENT_APPS.includes(header) ? header : null;
  req.sessionCookieName = COOKIE_NAMES[req.clientApp ?? 'internal'];
  middlewares[req.clientApp ?? 'internal'](req, res, next);
}

/** Rovnaké nastavenia ako pri vytvorení cookie – inak by ju prehliadač nezmazal. */
const clearCookieOptions = { path: '/', httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, secure: cookie.secure };

module.exports = { portalSession, clearCookieOptions };
