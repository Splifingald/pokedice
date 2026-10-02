import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import areas from '@/data/areas.json'
import items from '@/data/items.json'
import pokemon from '@/data/pokemon.json'
import trainers from '@/data/trainers.json'
import { readFileSync } from 'node:fs'
import regions from '@/data/regions.json'
import { allKeys, CJK_LANGS, detectLang, hasKey, LANGS, loadAllLangs, searchFold, tableFor, tIn } from '@/i18n'
import { CJK_RANGES, cjkFontFile, isCjkChar } from '@/i18n/cjk'
import fontChars from '@/i18n/cjk-chars.json'
import { areaKey, itemDescKey, itemKey, pokemonKey, slug, splitTrainerName, trainerClassKey } from '@/i18n/names'

// Each language is its own module now (vite.config.ts → i18nSheet); the sheet-wide checks need them all.
beforeAll(() => loadAllLangs())

const missing = (keys: string[]) => keys.filter((k) => !hasKey(k))

describe('the localization sheet', () => {
  it('names every Pokémon in the bundle', () => {
    expect(missing((pokemon as { dex: number }[]).map((p) => pokemonKey(p.dex)))).toEqual([])
  })

  it('names and describes every item', () => {
    const keys = (items as { key: string }[]).flatMap((i) => [itemKey(i.key), itemDescKey(i.key)])
    expect(missing(keys)).toEqual([])
  })

  it('names every area', () => {
    expect(missing((areas as { name: string }[]).map((a) => areaKey(a.name)))).toEqual([])
  })

  it('names every region', () => {
    expect(missing((regions as { id: string }[]).map((r) => `region.${r.id}`))).toEqual([])
  })

  it('knows every trainer class and badge in the bundle', () => {
    const rows = trainers as { name: string; badge: string | null }[]
    const classes = [...new Set(rows.map((t) => splitTrainerName(t.name).cls).filter((c): c is string => !!c))]
    expect(missing(classes.map(trainerClassKey))).toEqual([])
    const badges = [...new Set(rows.map((t) => t.badge).filter((b): b is string => !!b))]
    expect(missing(badges.map((b) => `badge.${slug(b)}`))).toEqual([])
  })

  it('gives a trainer with no known class its name back unchanged', () => {
    expect(splitTrainerName('Misty')).toEqual({ cls: null, given: 'Misty' })
    expect(splitTrainerName('Bug Catcher Kent')).toEqual({ cls: 'Bug Catcher', given: 'Kent' })
  })

  it('leaves no cell empty in any language', () => {
    const gaps: string[] = []
    for (const lang of LANGS) for (const key of allKeys()) if (!tableFor(lang)[key]) gaps.push(`${lang}:${key}`)
    expect(gaps).toEqual([])
  })

  it('interpolates {vars}, and shows the key when a row is missing', () => {
    expect(tIn('fr', 'pokemon.6')).toBe('Dracaufeu')
    expect(tIn('de', 'ui.common.level.short', { n: 12 })).toContain('12')
    expect(tIn('fr', 'nope.at.all')).toBe('nope.at.all')
  })

  it('keeps the English Pokémon names in Italian and Portuguese, and translates the rest', () => {
    for (const lang of ['it', 'pt', 'pt-BR'] as const) expect(tIn(lang, 'pokemon.6')).toBe('Charizard')
    expect(tIn('it', 'item.potion')).toBe('Pozione')
    expect(tIn('pt', 'ui.nav.team')).toBe('Equipa')
    expect(tIn('pt-BR', 'ui.nav.team')).toBe('Equipe')
  })

  it('uses the official CJK names', () => {
    expect(tIn('ja', 'pokemon.25')).toBe('ピカチュウ')
    expect(tIn('ko', 'pokemon.25')).toBe('피카츄')
    expect(tIn('zh-Hans', 'pokemon.25')).toBe('皮卡丘')
    expect(tIn('ja', 'trainerName.brock')).toBe('タケシ')
    expect(tIn('ja', 'ui.common.listSep')).toBe('、')
  })
})

describe('the pixel CJK font', () => {
  const sheetChars = (lang: string) => {
    const out = new Set<string>()
    for (const key of allKeys()) for (const c of tableFor(lang as never)[key] ?? '') if (isCjkChar(c)) out.add(c)
    return out
  }

  it('has every CJK character the sheet uses (run `pnpm i18n:fonts` after editing a CJK column)', () => {
    for (const lang of CJK_LANGS) {
      const font = new Set(fontChars[lang as keyof typeof fontChars])
      expect([...sheetChars(lang)].filter((c) => !font.has(c)).join(''), lang).toBe('')
    }
  })

  it('is declared once per CJK language, for exactly the CJK blocks', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const ranges = CJK_RANGES.map(([a, b]) => `U+${a.toString(16)}-${b.toString(16)}`.toUpperCase())
    for (const lang of CJK_LANGS) {
      const face = css.split('@font-face').find((f) => f.includes(`/fonts/${cjkFontFile(lang)}`))
      expect(face, lang).toBeDefined()
      for (const r of ranges) expect(face, `${lang} ${r}`).toContain(r)
      expect(readFileSync(`public/fonts/${cjkFontFile(lang)}`).length).toBeGreaterThan(50_000)
    }
  })
})

describe('searchFold', () => {
  it('finds katakana names typed in hiragana, and full-width numbers', () => {
    expect(searchFold('ぴかちゅう')).toBe(searchFold('ピカチュウ'))
    expect(searchFold('＃０２５')).toBe('#025')
    expect(searchFold(' Pikachu ')).toBe('pikachu')
  })
})

describe('detectLang', () => {
  afterEach(() => vi.unstubAllGlobals())
  const browser = (...languages: string[]) => vi.stubGlobal('navigator', { languages, language: languages[0] })

  it('picks the regional variant when the sheet has it, else its base language', () => {
    browser('pt-BR', 'en')
    expect(detectLang()).toBe('pt-BR')
    browser('pt-br')
    expect(detectLang()).toBe('pt-BR')
    browser('pt-PT')
    expect(detectLang()).toBe('pt')
    browser('it-CH')
    expect(detectLang()).toBe('it')
  })

  it('skips languages it does not speak, and falls back to English', () => {
    browser('ru-RU', 'de-AT')
    expect(detectLang()).toBe('de')
    browser('th')
    expect(detectLang()).toBe('en')
  })

  it('maps Chinese tags to Simplified, and never shows Simplified to Traditional readers', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-HK']) {
      browser(tag)
      expect(detectLang(), tag).toBe('zh-Hans')
    }
    browser('zh-TW', 'ja')
    expect(detectLang()).toBe('ja')
    browser('zh-Hant-HK')
    expect(detectLang()).toBe('en')
    browser('ja-JP')
    expect(detectLang()).toBe('ja')
    browser('ko-KR')
    expect(detectLang()).toBe('ko')
  })
})
