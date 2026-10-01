// The pixel CJK font: which characters it draws and where each language's file lives. Shared by the font script,
// the stylesheet's @font-face rules (src/i18n/cjk-fonts.ts) and the i18n test. No CSV import here.
import type { Lang } from './langs'

/**
 * The blocks the CJK face is declared for. Latin letters, digits, ₽ and punctuation like … stay in Jersey; only these
 * fall through to Fusion Pixel — so a page with no CJK text never downloads it.
 */
export const CJK_RANGES: readonly [number, number][] = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2fdf], // CJK and Kangxi radicals
  [0x3000, 0x303f], // CJK symbols and punctuation: 、。「」〜
  [0x3040, 0x30ff], // hiragana, katakana
  [0x3130, 0x318f], // Hangul compatibility Jamo
  [0x31f0, 0x31ff], // katakana extensions
  [0x3200, 0x32ff], // enclosed CJK
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xac00, 0xd7af], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xffef], // full-width forms: ！？（）：
]

export const isCjkChar = (c: string): boolean => {
  const code = c.codePointAt(0) ?? 0
  return CJK_RANGES.some(([a, b]) => code >= a && code <= b)
}

/** `ja` → `pokedice-cjk-ja.woff2`, under public/fonts. */
export const cjkFontFile = (lang: Lang): string => `pokedice-cjk-${lang.toLowerCase()}.woff2`

/** The CSS font family of each language's file. Latin languages use the Japanese one for players' CJK names. */
export const cjkFamily = (lang: Lang): string => `Pokedice CJK ${lang === 'ko' || lang === 'zh-Hans' ? lang : 'ja'}`
