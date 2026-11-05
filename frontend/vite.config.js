import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend volá oba backendy cez rovnaký origin (proxy), takže session cookie
// z Backendu 1 funguje bez problémov s CORS a SameSite.
// Poradie je dôležité: /api/ml musí byť pred /api.
//
// Dva portály z jedného kódu:
//   npm run dev     -> portál uchádzača, http://localhost:5173
//   npm run dev:hr  -> HR portál (--mode hr načíta .env.hr s VITE_APP=hr), http://localhost:5174
const BACKEND1 = process.env.BACKEND1_URL || 'http://localhost:3001';
const BACKEND2 = process.env.BACKEND2_URL || 'http://localhost:8000';

export default defineConfig(({ mode }) => {
  const app = loadEnv(mode, process.cwd(), 'VITE_').VITE_APP === 'hr' ? 'hr' : 'candidate';
  const cookieName = `sr.${app}.sid`;

  return {
    plugins: [react()],
    server: {
      port: app === 'hr' ? 5174 : 5173,
      strictPort: true,
      proxy: {
        // Backend 2 preposiela session do Backendu 1 pod menom hr.sid – premenujeme cookie portálu
        '/api/ml': {
          target: BACKEND2,
          changeOrigin: true,
          configure: (proxy) => proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('X-Client-App', app);
            proxyReq.setHeader('Cookie', `hr.sid=${readCookie(req.headers.cookie, cookieName)}`);
          }),
        },
        '/api': { target: BACKEND1, changeOrigin: true, headers: { 'X-Client-App': app } },
      },
    },
  };
});

/** Hodnota cookie z hlavičky Cookie (bez dekódovania – posiela sa ďalej tak, ako prišla). */
function readCookie(header = '', name) {
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : '';
}
