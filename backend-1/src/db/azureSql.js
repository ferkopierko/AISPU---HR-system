// Pripojenie na Azure SQL Database cez connection pool (mssql/tedious).
//
// - údaje sa berú iba z premenných prostredia (config/env.js), nič nie je v kóde,
// - spojenie je vždy šifrované (TLS) a certifikát servera sa overuje,
// - pool sa vytvorí raz a zdieľa sa v celej aplikácii,
// - hodnoty do SQL sa predávajú výhradne ako parametre (ochrana pred SQL injection).

const sql = require('mssql');
const { azureSql } = require('../config/env');

const poolConfig = {
  server: azureSql.server,
  port: azureSql.port,
  database: azureSql.database,
  user: azureSql.user,
  password: azureSql.password,
  options: {
    encrypt: true, // Azure SQL vyžaduje TLS
    // Azure: false = overiť certifikát *.database.windows.net;
    // lokálny SQL Server v Dockeri: true (self-signed certifikát)
    trustServerCertificate: azureSql.trustServerCertificate,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 30000, // Basic tier sa po nečinnosti môže prebúdzať dlhšie
  requestTimeout: 15000,
};

let poolPromise = null;

/** Vráti zdieľaný pool; pri prvom volaní sa pripojí. */
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(poolConfig)
      .connect()
      .then((pool) => {
        pool.on('error', (err) => console.error('[azureSql] chyba poolu:', err.message));
        return pool;
      })
      .catch((err) => {
        poolPromise = null; // pri ďalšom volaní skúsiť znova
        throw err;
      });
  }
  return poolPromise;
}

/**
 * Spustí parametrizovaný dotaz.
 * @param {string} text  SQL s parametrami v tvare @meno
 * @param {Object<string, *>} [params]  hodnoty parametrov
 * @example query('SELECT * FROM dbo.users WHERE email = @email', { email })
 */
async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [name, value] of Object.entries(params)) {
    request.input(name, value);
  }
  return request.query(text);
}

/** Overí spojenie – používa /health. */
async function ping() {
  const result = await query('SELECT 1 AS ok');
  return result.recordset[0].ok === 1;
}

/** Zatvorí pool (pri vypínaní servera). */
async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise.catch(() => null);
    poolPromise = null;
    if (pool) await pool.close();
  }
}

module.exports = { sql, getPool, query, ping, closePool };
