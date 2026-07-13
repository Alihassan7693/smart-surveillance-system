import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ── Change this when running on Colab with ngrok ───────────────────────────
//    e.g.  const BACKEND = 'https://xxxx-xxxx.ngrok-free.app'
const BACKEND = 'http://127.0.0.1:8000'
// ──────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api':   { target: BACKEND, changeOrigin: true, ws: true },
      '/ws':    { target: BACKEND, changeOrigin: true, ws: true },
      '/clips': { target: BACKEND, changeOrigin: true },
      '/health':{ target: BACKEND, changeOrigin: true },
    },
  },
})
