import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: './',
  server: { port: 4186, strictPort: true },
  preview: { port: 4186, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('../../dist/voxel', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    // The local plugin's font-src policy permits same-origin files. Keep the tiny original pixel font external.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
})
