/**
 * vite.web.config.ts
 *
 * Standalone Vite config for building the renderer as a static web app.
 * This is intentionally separate from electron.vite.config.ts so that the
 * Electron build is unaffected.
 *
 * Build:   npm run build:web
 * Output:  dist/web/   ← published to Netlify
 */

import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Use the renderer directory as the Vite root so index.html is found there
  root: resolve(__dirname, 'src/renderer'),

  plugins: [react()],

  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },

  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true
  },

  // Relative base so assets work from any subdirectory on Netlify
  base: './'
})
