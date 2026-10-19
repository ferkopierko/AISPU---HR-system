// Spoločné spracovanie chýb – klient dostane iba bezpečnú správu,
// detail neočakávaných chýb ide len do logu.

function notFound(req, res) {
  res.status(404).json({ error: 'Nenájdené' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Neplatný JSON' });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Interná chyba servera' });
}

module.exports = { notFound, errorHandler };
