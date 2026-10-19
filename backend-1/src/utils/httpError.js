// Chyba s HTTP stavom – vyhodí sa v route a errorHandler ju pošle klientovi.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
