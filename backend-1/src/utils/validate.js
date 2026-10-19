// Jednoduchá validácia vstupov (bez externej knižnice).

const HttpError = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kladné celé číslo z parametra / tela, inak 400. */
function parseId(value, name = 'id') {
  const id = Number(value);
  if (value === '' || value === null || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw new HttpError(400, `Neplatné ${name}`);
  }
  return id;
}

/** Email: povinný, orezaný, malými písmenami. */
function parseEmail(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Email je povinný');
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Neplatný email');
  }
  return email;
}

/** Heslo: 8 znakov až 72 bajtov (bcrypt zvyšok ignoruje). */
function parsePassword(value) {
  if (typeof value !== 'string' || value.length < 8) {
    throw new HttpError(400, 'Heslo musí mať aspoň 8 znakov');
  }
  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, 'Heslo je príliš dlhé (max. 72 bajtov)');
  }
  return value;
}

module.exports = { parseId, parseEmail, parsePassword };
