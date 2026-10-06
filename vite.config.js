import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  // relative base so the build works at any path (GitHub Pages serves the
  // app under /<repo>/)
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
})
