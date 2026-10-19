// Autorizácia podľa session: requireAuth (prihlásený) a requireRole (rola).

const HttpError = require('../utils/httpError');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return next(new HttpError(401, 'Neprihlásený používateľ'));
  }
  next();
}

/** @param {...('admin'|'user')} roles povolené roly */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return next(new HttpError(401, 'Neprihlásený používateľ'));
    }
    if (!roles.includes(req.session.role)) {
      return next(new HttpError(403, 'Nedostatočné oprávnenie'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
