// Frontend na Azure App Service (Node) – náhrada nginx.candidate.conf / nginx.hr.conf z Dockeru.
// Servíruje zostavený React (dist/) a presmeruje /api/ml na Backend 2 a /api na Backend 1.
// Prehliadač tak volá všetko z jedného originu a session cookie Backendu 1 funguje bez CORS.
//
// Ten istý server beží pre oba portály, rozlišuje ich CLIENT_APP:
//   candidate (predvolené) – portál uchádzača, dist/ zostavený s VITE_APP=candidate
//   hr                     – HR portál, dist/ zostavený s VITE_APP=hr

const path = require('node:path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = Number(process.env.PORT) || 8080;
const BACKEND1_URL = process.env.BACKEND1_URL;
const BACKEND2_URL = process.env.BACKEND2_URL;
if (!BACKEND1_URL || !BACKEND2_URL) {
  throw new Error('Chýbajú premenné prostredia BACKEND1_URL a BACKEND2_URL');
}
const CLIENT_APP = process.env.CLIENT_APP || 'candidate';
if (!['candidate', 'hr'].includes(CLIENT_APP)) {
  throw new Error('CLIENT_APP musí byť candidate alebo hr');
}
const COOKIE_NAME = `sr.${CLIENT_APP}.sid`;

/** Hodnota cookie z hlavičky Cookie (bez dekódovania – posiela sa ďalej tak, ako prišla). */
function readCookie(header = '', name) {
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : '';
}

const DIST = path.join(__dirname, 'dist');
const app = express();
app.disable('x-powered-by');

/**
 * Proxy celej cesty (pathFilter cestu neskracuje, na rozdiel od app.use('/api', …)).
 * X-Client-App povie Backendu 1, z ktorého portálu požiadavka je (cookie, povolené roly);
 * hodnotu z prehliadača prepíše. Backend 2 preposiela session pod menom hr.sid, preto
 * sa mu cookie portálu premenuje (rovnako ako v nginx).
 */
const proxy = (pathFilter, target, { renameSessionCookie = false } = {}) => createProxyMiddleware({
  pathFilter,
  target,
  changeOrigin: true, // App Service smeruje podľa hlavičky Host
  timeout: 120000, // backend na F1 pláne pri studenom štarte odpovedá pomaly
  proxyTimeout: 120000,
  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-Client-App', CLIENT_APP);
      if (renameSessionCookie) proxyReq.setHeader('Cookie', `hr.sid=${readCookie(req.headers.cookie, COOKIE_NAME)}`);
    },
  },
});

// Poradie je dôležité: /api/ml musí byť pred /api.
app.use(proxy('/api/ml', BACKEND2_URL, { renameSessionCookie: true }));
app.use(proxy('/api', BACKEND1_URL));

app.use(express.static(DIST, { index: false, maxAge: '1h' }));

// React Router – všetky ostatné cesty vrátia index.html
app.get(/.*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));

app.listen(PORT, () => console.log(`Frontend (${CLIENT_APP}) beží na porte ${PORT}`));
