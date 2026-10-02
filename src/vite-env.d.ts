/// <reference types="vite/client" />

/** One language's strings, cut from src/i18n/strings.csv at build time (vite.config.ts → i18nSheet). */
declare module 'virtual:i18n/*' {
  const table: Record<string, string>
  export default table
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ADMIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
