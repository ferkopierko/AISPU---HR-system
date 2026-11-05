// /api/auth – registrácia, prihlásenie, odhlásenie, aktuálny používateľ.

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseEmail, parsePassword, parseFullName, parsePhone } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { clearCookieOptions } = require('../middleware/session');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const SQL_UNIQUE_VIOLATION = [2627, 2601];
// Pri neexistujúcom emaile sa aj tak porovná heslo, aby čas odozvy
// neprezradil, či účet existuje.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

/** Nová session (ochrana pred session fixation) + zápis userId, role a portálu. */
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.clientApp = req.clientApp; // podľa neho requireRole pustí HR endpointy iba z HR portálu
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// Kto sa smie prihlásiť do ktorého portálu (X-Client-App, middleware/session.js).
const PORTAL_ROLES = { candidate: ['user'], hr: ['admin', 'sysadmin'] };
const PORTAL_DENIED = {
  candidate: 'HR účty sa prihlasujú v HR portáli',
  hr: 'Tento účet nemá prístup do HR portálu',
};

/** Portál z hlavičky X-Client-App; bez nej sa prihlásiť ani registrovať nedá. */
function requirePortal(req) {
  if (!req.clientApp) throw new HttpError(400, 'Chýba hlavička X-Client-App (candidate alebo hr)');
  return req.clientApp;
}

const USER_COLUMNS = 'id, email, role, full_name, phone';
const toPublicUser = (u) => ({ id: u.id, email: u.email, role: u.role, fullName: u.full_name, phone: u.phone });

async function loadUser(id) {
  const { recordset } = await db.query(`SELECT ${USER_COLUMNS} FROM dbo.users WHERE id = @id`, { id });
  return recordset[0];
}

// POST /api/auth/register  { email, password, fullName, phone? }
// Registrovať sa dá iba ako 'user'; admina vytvára skript scripts/create-admin.js.
router.post('/register', async (req, res) => {
  if (requirePortal(req) !== 'candidate') {
    throw new HttpError(403, 'Registrácia je dostupná iba v portáli uchádzača');
  }
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);
  const fullName = parseFullName(req.body?.fullName);
  const phone = parsePhone(req.body?.phone);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    const { recordset } = await db.query(
      `INSERT INTO dbo.users (email, password_hash, role, full_name, phone)
       OUTPUT inserted.id, inserted.email, inserted.role, inserted.full_name, inserted.phone
       VALUES (@email, @passwordHash, N'user', @fullName, @phone)`,
      { email, passwordHash, fullName, phone }
    );
    user = recordset[0];
  } catch (err) {
    if (SQL_UNIQUE_VIOLATION.includes(err.number)) {
      throw new HttpError(409, 'Účet s týmto emailom už existuje');
    }
    throw err;
  }

  await startSession(req, user);
  res.status(201).json({ user: toPublicUser(user) });
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res) => {
  const portal = requirePortal(req);
  const email = parseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const { recordset } = await db.query(
    `SELECT ${USER_COLUMNS}, password_hash FROM dbo.users WHERE email = @email`,
    { email }
  );
  const user = recordset[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Nesprávny email alebo heslo');
  }
  // rola sa overuje až po správnom hesle, aby sa nedalo zisťovať, ktoré účty sú HR
  if (!PORTAL_ROLES[portal].includes(user.role)) {
    throw new HttpError(403, PORTAL_DENIED[portal]);
  }

  await startSession(req, user);
  res.json({ user: toPublicUser(user) });
});

// POST /api/auth/logout – zmaže session a cookie portálu, z ktorého prišla požiadavka
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(req.sessionCookieName, clearCookieOptions);
    res.status(204).end();
  });
});

// GET /api/auth/me – kto je prihlásený (frontend ho volá po obnovení stránky)
router.get('/me', requireAuth, async (req, res) => {
  const user = await loadUser(req.session.userId);
  if (!user) {
    req.session.destroy(() => {}); // účet medzičasom zmazaný
    throw new HttpError(401, 'Neprihlásený používateľ');
  }
  res.json({ user: toPublicUser(user) });
});

// PUT /api/auth/me  { fullName, phone? } – úprava profilu (email ani rola sa tu nemenia)
router.put('/me', requireAuth, async (req, res) => {
  const fullName = parseFullName(req.body?.fullName);
  const phone = parsePhone(req.body?.phone);
  const { recordset } = await db.query(
    `UPDATE dbo.users SET full_name = @fullName, phone = @phone
     OUTPUT inserted.id, inserted.email, inserted.role, inserted.full_name, inserted.phone
     WHERE id = @id`,
    { id: req.session.userId, fullName, phone }
  );
  if (!recordset[0]) throw new HttpError(401, 'Neprihlásený používateľ');
  res.json({ user: toPublicUser(recordset[0]) });
});

// PUT /api/auth/me/password  { currentPassword, newPassword }
// Zlé súčasné heslo -> 400 (nie 401, frontend by používateľa považoval za odhláseného).
router.put('/me/password', requireAuth, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = parsePassword(req.body?.newPassword);

  const { recordset } = await db.query(
    `SELECT ${USER_COLUMNS}, password_hash FROM dbo.users WHERE id = @id`,
    { id: req.session.userId }
  );
  const user = recordset[0];
  if (!user) throw new HttpError(401, 'Neprihlásený používateľ');
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new HttpError(400, 'Súčasné heslo je nesprávne');
  }
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new HttpError(400, 'Nové heslo musí byť iné ako súčasné');
  }

  await db.query('UPDATE dbo.users SET password_hash = @hash WHERE id = @id', {
    id: user.id,
    hash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
  });
  await startSession(req, user); // nové ID session po zmene hesla
  res.status(204).end();
});

module.exports = router;
