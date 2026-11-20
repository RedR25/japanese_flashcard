import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev: same-origin /api like production (where Vercel rewrites /api to Railway).
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
