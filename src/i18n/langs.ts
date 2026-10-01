/** The shipped languages. No CSV import here, so node scripts and the engine can use the type freely. */
export const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'pt-BR', 'ja', 'ko', 'zh-Hans'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'en'

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '简体中文',
}

/** The languages written in CJK scripts: they draw with the pixel CJK font and get their own line-breaking rules. */
export const CJK_LANGS: readonly Lang[] = ['ja', 'ko', 'zh-Hans']

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)
