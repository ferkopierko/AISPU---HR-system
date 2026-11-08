// Autorizácia podľa session: requireAuth (prihlásený) a requireRole (rola).

const HttpError = require('../utils/httpError');
const db = require('../db/azureSql');

// Read current permissions on each API request: a demoted account must not keep
// privileges through an older session (including requests forwarded by Backend 2).
async function refreshSessionRole(req, res, next) {
  if (req.session.userId && req.path.startsWith('/api/')) {
    const { recordset } = await db.query('SELECT role FROM dbo.users WHERE id = @id', { id: req.session.userId });
    if (!recordset[0]) {
      delete req.session.userId;
      delete req.session.role;
    } else req.session.role = recordset[0].role;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return next(new HttpError(401, 'Neprihlásený používateľ'));
  }
  next();
}

const STAFF_ROLES = ['admin', 'sysadmin'];

/** @param {...('admin'|'user'|'sysadmin')} roles povolené roly */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return next(new HttpError(401, 'Neprihlásený používateľ'));
    }
    if (!roles.includes(req.session.role) && !(req.session.role === 'sysadmin' && roles.includes('admin'))) {
      return next(new HttpError(403, 'Nedostatočné oprávnenie'));
    }
    // HR a správa systému iba so session z HR portálu (aj keby rolu povýšili uchádzačovi počas session)
    if (roles.some((role) => STAFF_ROLES.includes(role)) && req.session.clientApp !== 'hr') {
      return next(new HttpError(403, 'Táto časť je dostupná iba v HR portáli'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, refreshSessionRole };
