// Localization. The single source of truth is src/i18n/strings.csv — edit that sheet, nothing else.
// Columns: key, then one per LANGS code (en,fr,es,de,it,pt,pt-BR,ja,ko,zh-Hans). A blank cell falls back to English; an unknown key renders as the key
// itself, which makes a missing row loud instead of invisible.
//
// Each language is its own module, cut from the sheet at build time (vite.config.ts → i18nSheet): English is built in,
// the others are downloaded when a player needs them (loadLang), so nobody downloads ten languages they don't read.
import { josa } from './ko'
import { DEFAULT_LANG, LANGS, type Lang } from './langs'
import en from 'virtual:i18n/en'

export { CJK_LANGS, DEFAULT_LANG, isLang, LANG_LABELS, LANGS, type Lang } from './langs'
export { searchFold } from './fold'

type Table = Record<string, string>

/** The import of each downloadable language: written out so the bundler gives each its own file. */
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Table }>> = {
  fr: () => import('virtual:i18n/fr'),
  es: () => import('virtual:i18n/es'),
  de: () => import('virtual:i18n/de'),
  it: () => import('virtual:i18n/it'),
  pt: () => import('virtual:i18n/pt'),
  'pt-BR': () => import('virtual:i18n/pt-BR'),
  ja: () => import('virtual:i18n/ja'),
  ko: () => import('virtual:i18n/ko'),
  'zh-Hans': () => import('virtual:i18n/zh-Hans'),
}

/** The languages loaded so far. Until a language is, `t()` in it reads English. */
const TABLE: Partial<Record<Lang, Table>> = { en }

export const isLangLoaded = (lang: Lang): boolean => !!TABLE[lang]

const loading = new Map<Lang, Promise<boolean>>()

/** Downloads `lang`'s strings, once. False when it couldn't (offline): that language reads English until a retry. */
export function loadLang(lang: Lang): Promise<boolean> {
  if (TABLE[lang]) return Promise.resolve(true)
  let p = loading.get(lang)
  if (!p) {
    p = LOADERS[lang as Exclude<Lang, 'en'>]()
      .then((m) => {
        TABLE[lang] = m.default
        return true
      })
      .catch((err: unknown) => {
        console.warn(`[i18n] could not load ${lang}`, err)
        loading.delete(lang)
        return false
      })
    loading.set(lang, p)
  }
  return p
}

/** Every language at once — for the tests that walk the whole sheet. */
export const loadAllLangs = (): Promise<boolean[]> => Promise.all(LANGS.map(loadLang))

const EN: Table = en

/** `pt-br` → `pt-BR`, `it` → `it`: a browser tag matched against the shipped codes, ignoring case. */
const langOf = (tag: string): Lang | undefined => LANGS.find((l) => l.toLowerCase() === tag.toLowerCase())

/**
 * Chinese tags don't share a prefix with `zh-Hans`. Simplified-script regions map to it; Traditional ones (`zh-TW`,
 * `zh-HK`, `zh-Hant`) map to nothing, so they fall through to the next preference rather than to the wrong script.
 */
function chineseOf(tag: string): Lang | null | undefined {
  const t = tag.toLowerCase()
  if (t !== 'zh' && !t.startsWith('zh-')) return undefined
  if (/^zh-(hant|tw|hk|mo)\b/.test(t)) return null
  return 'zh-Hans'
}

/** The browser's preferred language, when we speak it: the exact regional variant first (`pt-BR`), then its base (`pt-PT` → `pt`). */
export function detectLang(): Lang {
  const prefs: readonly string[] =
    typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]).filter(Boolean)
  for (const p of prefs) {
    const zh = chineseOf(p)
    if (zh === null) continue
    const hit = zh ?? langOf(p) ?? langOf(p.split('-')[0] ?? '')
    if (hit) return hit
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
  const hit = TABLE[lang]?.[key] ?? EN[key]
  const text = interpolate(hit ?? key, vars)
  return lang === 'ko' && vars ? josa(text) : text
}

export function t(key: string, vars?: TVars): string {
  return tIn(current, key, vars)
}

/** `a, b, c` — or `a、b、c` in Japanese and Chinese: the separator is a sheet row. */
export const joinList = (items: readonly string[]): string => items.join(t('ui.common.listSep'))

/** `key.one` / `key.other`, picked on `count` — which is also available to the text as {count}. */
export function tPlural(key: string, count: number, vars?: TVars): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...vars })
}

/** True when the sheet has a row for this key in any language loaded (English always is). */
export const hasKey = (key: string): boolean => key in EN || LANGS.some((l) => key in (TABLE[l] ?? {}))

/** Every key in the sheet — the i18n test walks these. */
export const allKeys = (): string[] => Object.keys(EN)

/** A loaded language's strings; empty until loadLang(lang) has finished. */
export const tableFor = (lang: Lang): Table => TABLE[lang] ?? {}
