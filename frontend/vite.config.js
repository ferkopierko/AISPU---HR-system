import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend volá oba backendy cez rovnaký origin (proxy), takže session cookie
// z Backendu 1 funguje bez problémov s CORS a SameSite.
// Poradie je dôležité: /api/ml musí byť pred /api.
const BACKEND1 = process.env.BACKEND1_URL || 'http://localhost:3001';
const BACKEND2 = process.env.BACKEND2_URL || 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/ml': { target: BACKEND2, changeOrigin: true },
      '/api': { target: BACKEND1, changeOrigin: true },
    },
  },
});
