// Localization. The single source of truth is src/i18n/strings.csv — edit that sheet, nothing else.
// Columns: key,en,fr,es,de. A blank cell falls back to English; an unknown key renders as the key
// itself, which makes a missing row loud instead of invisible.
import { parseCsv } from './csv'
import { DEFAULT_LANG, isLang, LANGS, type Lang } from './langs'
import sheet from './strings.csv?raw'

export { DEFAULT_LANG, isLang, LANG_LABELS, LANGS, type Lang } from './langs'

function build(): Record<Lang, Record<string, string>> {
  const out = { en: {}, fr: {}, es: {}, de: {} } as Record<Lang, Record<string, string>>
  const rows = parseCsv(sheet)
  const header = (rows[0] ?? []).map((h) => h.trim())
  const cols = LANGS.map((l) => header.indexOf(l))
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const key = (row[0] ?? '').trim()
    if (!key || key.startsWith('#')) continue
    LANGS.forEach((lang, n) => {
      const col = cols[n] ?? -1
      const value = col >= 0 ? row[col] : undefined
      if (value != null && value !== '') out[lang][key] = value
    })
  }
  return out
}

const TABLE = build()

/** The browser's preferred language, when we speak it. */
export function detectLang(): Lang {
  const prefs: readonly string[] =
    typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean)
  for (const p of prefs) {
    const base = p.toLowerCase().split('-')[0] ?? ''
    if (isLang(base)) return base
  }
  return DEFAULT_LANG
}

let current: Lang = DEFAULT_LANG

export const getLang = (): Lang => current

/** Set by the store; `t()` outside React reads it, `useT()` re-renders on it. */
export function setLangInternal(lang: Lang) {
  current = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export type TVars = Record<string, string | number>

function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))
}

/** Look a key up in `lang`, then English, then give back the key so a missing row is visible. */
export function tIn(lang: Lang, key: string, vars?: TVars): string {
  const hit = TABLE[lang][key] ?? TABLE.en[key]
  return interpolate(hit ?? key, vars)
}

export function t(key: string, vars?: TVars): string {
  return tIn(current, key, vars)
}

/** `key.one` / `key.other`, picked on `count` — which is also available to the text as {count}. */
export function tPlural(key: string, count: number, vars?: TVars): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars })
}

/** True when the sheet has a row for this key in any language. */
export const hasKey = (key: string): boolean => key in TABLE.en || LANGS.some((l) => key in TABLE[l])

/** Every key in the sheet — the i18n test walks these. */
export const allKeys = (): string[] => Object.keys(TABLE.en)

export const tableFor = (lang: Lang): Record<string, string> => TABLE[lang]
