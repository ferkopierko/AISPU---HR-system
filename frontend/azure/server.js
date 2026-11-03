// Frontend na Azure App Service (Node) – náhrada nginx.conf z Dockeru.
// Servíruje zostavený React (dist/) a presmeruje /api/ml na Backend 2 a /api na Backend 1.
// Prehliadač tak volá všetko z jedného originu a session cookie Backendu 1 funguje bez CORS.

const path = require('node:path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = Number(process.env.PORT) || 8080;
const BACKEND1_URL = process.env.BACKEND1_URL;
const BACKEND2_URL = process.env.BACKEND2_URL;
if (!BACKEND1_URL || !BACKEND2_URL) {
  throw new Error('Chýbajú premenné prostredia BACKEND1_URL a BACKEND2_URL');
}

const DIST = path.join(__dirname, 'dist');
const app = express();
app.disable('x-powered-by');

/** Proxy celej cesty (pathFilter cestu neskracuje, na rozdiel od app.use('/api', …)). */
const proxy = (pathFilter, target) => createProxyMiddleware({
  pathFilter,
  target,
  changeOrigin: true, // App Service smeruje podľa hlavičky Host
  timeout: 120000, // backend na F1 pláne pri studenom štarte odpovedá pomaly
  proxyTimeout: 120000,
});

// Poradie je dôležité: /api/ml musí byť pred /api.
app.use(proxy('/api/ml', BACKEND2_URL));
app.use(proxy('/api', BACKEND1_URL));

app.use(express.static(DIST, { index: false, maxAge: '1h' }));

// React Router – všetky ostatné cesty vrátia index.html
app.get(/.*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));

app.listen(PORT, () => console.log(`Frontend beží na porte ${PORT}`));
