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
  // Spoločný kľúč s Backendom 2 pre /api/internal/* (odovzdanie CV).
  // Ak nie je nastavený, interné endpointy vracajú 503.
  internalApiKey: process.env.INTERNAL_API_KEY || null,
  // Backend 2 – mazanie analýz CV pri stiahnutí prihlášky a po uplynutí lehoty (v Dockeri http://backend-2:8000)
  backend2Url: (process.env.BACKEND2_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  // GDPR: prihlášky staršie ako toľko mesiacov sa raz denne zmažú (text pri súhlase sľubuje 6)
  retentionMonths: Number(process.env.RETENTION_MONTHS) || 6,
  azureSql: Object.freeze({
    server: process.env.AZURE_SQL_HOST,
    port: Number(process.env.AZURE_SQL_PORT) || 1433,
    database: process.env.AZURE_SQL_DATABASE,
    user: process.env.AZURE_SQL_USER,
    password: process.env.AZURE_SQL_PASSWORD,
    // Lokálny SQL Server v Dockeri má self-signed certifikát → AZURE_SQL_TRUST_CERT=true.
    // Pre Azure SQL nechať nenastavené (certifikát sa overuje).
    trustServerCertificate: process.env.AZURE_SQL_TRUST_CERT === 'true',
  }),
});
