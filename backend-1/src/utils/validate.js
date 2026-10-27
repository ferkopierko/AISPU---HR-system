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

/** Meno a priezvisko: povinné, 2–200 znakov. */
function parseFullName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2) throw new HttpError(400, 'Meno je povinné');
  if (name.length > 200) throw new HttpError(400, 'Meno môže mať najviac 200 znakov');
  return name;
}

const PHONE_RE = /^\+?[\d\s()/-]+$/;

/** Telefón: voliteľný (prázdny = null), 9–15 číslic, povolené + medzery ( ) / -. */
function parsePhone(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Telefón musí byť text');
  const phone = value.trim().replace(/\s+/g, ' ');
  const digits = phone.replace(/\D/g, '').length;
  if (phone.length > 50 || !PHONE_RE.test(phone) || digits < 9 || digits > 15) {
    throw new HttpError(400, 'Neplatné telefónne číslo');
  }
  return phone;
}

module.exports = { parseId, parseEmail, parsePassword, parseFullName, parsePhone };
