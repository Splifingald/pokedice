/// <reference types="vite/client" />

/** This build's id, also written to /version.json (vite.config.ts). */
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ADMIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
