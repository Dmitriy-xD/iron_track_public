import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site and its PHP API (server/api) live on the same domain, so the API is "./api" by default.
// For local development run the API with PHP (see server/README.md) and Vite proxies /api to it.
const apiUrl = process.env.API_URL || ''
const devApi = process.env.DEV_API || 'http://127.0.0.1:8089'

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works on GitHub Pages, Netlify or any sub-path.
  base: './',
  define: {
    __API_URL__: JSON.stringify(apiUrl),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'dev')
  },
  server: { fs: { allow: ['..'] }, proxy: { '/api': devApi } },
  test: { environment: 'node' }
} as any)
