/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/** Dev only: lets Admin → "Pull from Supabase" rewrite src/data/*.json and supabase/seed.sql. */
function devBundleWriter(): Plugin {
  return {
    name: 'pokedice-dev-bundle-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/write-bundle', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
        req.on('end', () => {
          void (async () => {
            try {
              const mod = (await server.ssrLoadModule('/scripts/import-bundle.ts')) as typeof import('./scripts/import-bundle')
              await mod.writeBundleFiles(JSON.parse(body))
              res.statusCode = 204
              res.end()
            } catch (err) {
              res.statusCode = 500
              res.end(err instanceof Error ? err.message : String(err))
            }
          })()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devBundleWriter()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
})
