// Úložisko sessions v Azure SQL / SQL Serveri (tabuľka dbo.sessions) pre express-session.
//
// Sessions tak prežijú reštart kontajnera a zdieľajú ich všetky inštancie Backendu 1.
// Exspirované riadky sa ignorujú pri čítaní a raz za čas sa zmažú.

const session = require('express-session');
const db = require('./azureSql');

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8; // ak session nemá vlastnú expiráciu cookie
const CLEANUP_INTERVAL_MS = 1000 * 60 * 15;

/** Kedy session vyprší – podľa cookie, inak o DEFAULT_TTL_MS. */
function expiresAt(sess) {
  const expires = sess?.cookie?.expires;
  return expires ? new Date(expires) : new Date(Date.now() + DEFAULT_TTL_MS);
}

/** Promise -> callback, ktorý express-session očakáva. */
function done(promise, cb = () => {}) {
  promise.then((value) => cb(null, value), (err) => cb(err));
}

class MssqlSessionStore extends session.Store {
  constructor() {
    super();
    this.cleanupTimer = setInterval(() => {
      this.clearExpired().catch((err) => console.error('[sessions] mazanie exspirovaných zlyhalo:', err.message));
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref(); // časovač nesmie držať proces nažive
  }

  get(sid, cb) {
    done(
      db.query('SELECT session FROM dbo.sessions WHERE sid = @sid AND expires > SYSUTCDATETIME()', { sid })
        .then(({ recordset }) => (recordset[0] ? JSON.parse(recordset[0].session) : null)),
      cb
    );
  }

  set(sid, sess, cb) {
    done(
      db.query(
        `MERGE dbo.sessions WITH (HOLDLOCK) AS t
         USING (SELECT @sid AS sid) AS s ON t.sid = s.sid
         WHEN MATCHED THEN UPDATE SET session = @session, expires = @expires
         WHEN NOT MATCHED THEN INSERT (sid, session, expires) VALUES (@sid, @session, @expires);`,
        { sid, session: JSON.stringify(sess), expires: expiresAt(sess) }
      ).then(() => undefined),
      cb
    );
  }

  destroy(sid, cb) {
    done(db.query('DELETE FROM dbo.sessions WHERE sid = @sid', { sid }).then(() => undefined), cb);
  }

  // volá express-session pri požiadavke bez zmeny session – predĺži expiráciu v DB podľa cookie
  touch(sid, sess, cb) {
    done(
      db.query('UPDATE dbo.sessions SET expires = @expires WHERE sid = @sid', { sid, expires: expiresAt(sess) })
        .then(() => undefined),
      cb
    );
  }

  /** Zmaže exspirované sessions (volá sa automaticky každých 15 minút). */
  async clearExpired() {
    await db.query('DELETE FROM dbo.sessions WHERE expires <= SYSUTCDATETIME()');
  }
}

module.exports = { MssqlSessionStore };
