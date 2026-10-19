// Načítanie a validácia konfigurácie z premenných prostredia.
// Lokálne sa číta spoločný .env v koreni projektu; v cloude (App Service,
// kontajner) sa premenné nastavujú priamo a .env neexistuje – to je v poriadku.

const path = require('node:path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../../.env'),
  quiet: true,
});

const REQUIRED = [
  'AZURE_SQL_HOST',
  'AZURE_SQL_DATABASE',
  'AZURE_SQL_USER',
  'AZURE_SQL_PASSWORD',
  'SESSION_SECRET',
];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Chýbajú premenné prostredia: ${missing.join(', ')} (pozri .env.example)`);
}

const isProduction = process.env.NODE_ENV === 'production';

module.exports = Object.freeze({
  isProduction,
  port: Number(process.env.BACKEND1_PORT) || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET,
  azureSql: Object.freeze({
    server: process.env.AZURE_SQL_HOST,
    port: Number(process.env.AZURE_SQL_PORT) || 1433,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
  }),
});
