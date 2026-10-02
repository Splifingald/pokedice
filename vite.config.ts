/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { isLang } from './src/i18n/langs'
import { sheetTables } from './src/i18n/sheet'

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
 * `virtual:i18n/<lang>` → that language's strings from src/i18n/strings.csv, as a module of its own. English is
 * imported statically, the others with import(), so each becomes a separate file a player downloads only when they
 * play in it (src/i18n/index.ts). The sheet stays the single source; editing it reloads the dev server.
 */
function i18nSheet(): Plugin {
  const PREFIX = 'virtual:i18n/'
  const sheetPath = fileURLToPath(new URL('./src/i18n/strings.csv', import.meta.url))
  return {
    name: 'pokedice-i18n-sheet',
    resolveId(id) {
      return id.startsWith(PREFIX) ? `\0${id}` : undefined
    },
    load(id) {
      if (!id.startsWith(`\0${PREFIX}`)) return undefined
      const lang = id.slice(PREFIX.length + 1)
      if (!isLang(lang)) this.error(`pokedice-i18n-sheet: unknown language "${lang}"`)
      this.addWatchFile(sheetPath)
      return `export default ${JSON.stringify(sheetTables(readFileSync(sheetPath, 'utf8'))[lang])}`
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
  plugins: [react(), i18nSheet(), devBundleWriter(), buildVersion()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // One file per rate of change (docs/11-SCALING-COST-PLAN.md §4.1): a deploy that changes game code leaves the
        // libraries and the bundled content where browsers already have them, so players re-download ~the game code.
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router|zustand|immer)\//.test(id))
              return 'vendor'
            if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion'
            if (id.includes('/node_modules/zod/')) return 'zod'
            // Anything else (the Supabase client) stays in the lazy chunks that import it.
            return undefined
          }
          if (id.includes('/src/data/') && id.endsWith('.json')) return 'data'
          return undefined
        },
      },
    },
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
