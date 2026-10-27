// The rework prototype as an Artifact: the real game, built as one page. Every public file is asked for relative to
// the page (an Artifact isn't served from the site's root), Showdown's sprites come from the page's own files, the
// app's own images are inlined, and the code is one chunk (inlined into the page by scripts/proto-inline.py).
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const PUBLIC = 'area-art|backgrounds|banners|battle|characters|fonts|icons|items|pokemon|region-art|trainers'
const ABS = new RegExp(`(["'\`(])/(${PUBLIC})/`, 'g')

function relativePublic(): Plugin {
  return {
    name: 'proto-relative-public',
    enforce: 'post',
    transform(code) {
      return code.match(ABS) ? { code: code.replace(ABS, '$1./$2/'), map: null } : null
    },
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk') f.code = f.code.replace(ABS, '$1./$2/')
        else if (typeof f.source === 'string') f.source = f.source.replace(ABS, '$1./$2/')
      }
    },
  }
}

export default defineConfig({
  base: './',
  mode: 'proto',
  plugins: [react(), relativePublic()],
  define: { __BUILD_ID__: JSON.stringify('proto'), 'import.meta.env.VITE_PROTO': JSON.stringify('1') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-proto',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
