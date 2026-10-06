import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // relative base so the build works at any path (GitHub Pages serves the
  // app under /<repo>/)
  base: './',
  plugins: [react()],
})
