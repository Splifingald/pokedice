/// <reference types="vite/client" />

/** This build's id, also written to /version.json (vite.config.ts). */
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ADMIN_EMAIL?: string
  /** Push notifications' VAPID public key (docs/27); unset = no push. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
