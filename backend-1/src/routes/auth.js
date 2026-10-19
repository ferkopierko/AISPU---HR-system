// /api/auth – registrácia, prihlásenie, odhlásenie, aktuálny používateľ.

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/azureSql');
const HttpError = require('../utils/httpError');
const { parseEmail, parsePassword } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const BCRYPT_ROUNDS = 12;
const SQL_UNIQUE_VIOLATION = [2627, 2601];
// Pri neexistujúcom emaile sa aj tak porovná heslo, aby čas odozvy
// neprezradil, či účet existuje.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

/** Nová session (ochrana pred session fixation) + zápis userId a role. */
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

const toPublicUser = (u) => ({ id: u.id, email: u.email, role: u.role });

// POST /api/auth/register  { email, password }
// Registrovať sa dá iba ako 'user'; admina vytvára skript scripts/create-admin.js.
router.post('/register', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let user;
  try {
    const { recordset } = await db.query(
      `INSERT INTO dbo.users (email, password_hash, role)
       OUTPUT inserted.id, inserted.email, inserted.role
       VALUES (@email, @passwordHash, N'user')`,
      { email, passwordHash }
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
  const email = parseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const { recordset } = await db.query(
    'SELECT id, email, password_hash, role FROM dbo.users WHERE email = @email',
    { email }
  );
  const user = recordset[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Nesprávny email alebo heslo');
  }

  await startSession(req, user);
  res.json({ user: toPublicUser(user) });
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('hr.sid');
    res.status(204).end();
  });
});

// GET /api/auth/me – kto je prihlásený (frontend ho volá po obnovení stránky)
router.get('/me', requireAuth, async (req, res) => {
  const { recordset } = await db.query(
    'SELECT id, email, role FROM dbo.users WHERE id = @id',
    { id: req.session.userId }
  );
  if (!recordset[0]) {
    req.session.destroy(() => {}); // účet medzičasom zmazaný
    throw new HttpError(401, 'Neprihlásený používateľ');
  }
  res.json({ user: toPublicUser(recordset[0]) });
});

module.exports = router;
