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

/**
 * version.json names this build's entry script (`{ "build": "assets/index-<hash>.js" }`). Open tabs compare it with the
 * script they loaded (src/lib/buildId.ts) to know a newer build is out. The entry's hash already covers every chunk it
 * imports, so it changes exactly when the code or the bundled data does: a rebuild of the same code (a docs-only
 * deploy, a retried build) gives the same name, re-downloads nothing and reloads no tab.
 */
function buildVersion(): Plugin {
  return {
    name: 'pokedice-build-version',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (f) => f.type === 'chunk' && f.isEntry && f.fileName.startsWith('assets/index-'),
      )
      if (!entry) this.error('pokedice-build-version: no entry chunk to name in version.json')
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: entry.fileName }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devBundleWriter(), buildVersion()],
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
