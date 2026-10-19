const app = require('./app');
const config = require('./config/env');
const db = require('./db/azureSql');

const server = app.listen(config.port, () => {
  console.log(`Backend 1 beží na http://localhost:${config.port}`);
});

// Overiť DB hneď pri štarte, nech je chyba konfigurácie vidieť okamžite.
db.ping()
  .then(() => console.log(`Pripojené na Azure SQL (${config.azureSql.server}/${config.azureSql.database})`))
  .catch((err) => console.error('Azure SQL nedostupná:', err.message));

async function shutdown(signal) {
  console.log(`${signal} – vypínam…`);
  server.close();
  await db.closePool();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
