/** The shipped languages. No CSV import here, so node scripts and the engine can use the type freely. */
export const LANGS = ['en', 'fr', 'es', 'de'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'en'

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
}

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)
