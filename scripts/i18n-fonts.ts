/**
 * Builds the pixel CJK fonts from Fusion Pixel 12px (SIL OFL 1.1, by TakWolf), one per CJK language, subset to what
 * the game can show:
 *
 *   - every character of that language's column in src/i18n/strings.csv, so no menu ever falls back to a system font;
 *   - the language's standard character set (JIS X 0208, KS X 1001, GB 2312), plus every kana and every KS X 1001
 *     Hangul syllable, so players' names on the leaderboard and in Versus draw in the pixel face too.
 *
 *   pnpm i18n:fonts
 *
 * Run it after editing a CJK column of the sheet: `tests/i18n.test.ts` fails when the sheet uses a character the
 * committed font doesn't have. Each language uses its own Fusion build, because Han characters shared by Chinese and
 * Japanese are drawn differently in each (直, 骨, 写…).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import subsetFont from 'subset-font'
import { parseCsv } from '../src/i18n/csv'
import { CJK_RANGES, cjkFontFile, isCjkChar } from '../src/i18n/cjk'
import { CJK_LANGS, type Lang } from '../src/i18n/langs'

const require = createRequire(import.meta.url)
const ROOT = resolve(import.meta.dirname, '..')
const SHEET = resolve(ROOT, 'src/i18n/strings.csv')
const OUT = resolve(ROOT, 'public/fonts')
const CHARS = resolve(ROOT, 'src/i18n/cjk-chars.json')

/** The Fusion build drawn for each language, from its fontsource package. */
const SOURCE: Record<string, string> = {
  ja: '@fontsource/fusion-pixel-12px-proportional-jp/files/fusion-pixel-12px-proportional-jp-latin-400-normal.woff2',
  ko: '@fontsource/fusion-pixel-12px-proportional-kr/files/fusion-pixel-12px-proportional-kr-latin-400-normal.woff2',
  'zh-Hans': '@fontsource/fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2',
}

/** Every character of a two-byte EUC character set: rows and cells 0xA1–0xFE. */
function eucCharset(encoding: string): string {
  const decoder = new TextDecoder(encoding, { fatal: true })
  let out = ''
  for (let lead = 0xa1; lead <= 0xfe; lead++)
    for (let trail = 0xa1; trail <= 0xfe; trail++) {
      try {
        out += decoder.decode(new Uint8Array([lead, trail]))
      } catch {
        // an unassigned cell
      }
    }
  return out
}

/** The standard set each language's names are written in. `gb18030` decodes GB 2312's EUC cells unchanged. */
const CHARSET: Record<string, string> = { ja: 'euc-jp', ko: 'euc-kr', 'zh-Hans': 'gb18030' }

const KANA = Array.from({ length: 0x30ff - 0x3041 + 1 }, (_, i) => String.fromCharCode(0x3041 + i)).join('')

async function main() {
  const rows = parseCsv(readFileSync(SHEET, 'utf8'))
  const header = (rows[0] ?? []).map((h) => h.trim())
  const hangul = [...eucCharset('euc-kr')].filter((c) => c >= '가' && c <= '힣').join('')
  const sheetChars: Partial<Record<Lang, string>> = {}

  mkdirSync(OUT, { recursive: true })
  for (const lang of CJK_LANGS) {
    const col = header.indexOf(lang)
    if (col < 0) throw new Error(`no ${lang} column in the sheet`)
    const used = new Set<string>()
    for (const row of rows.slice(1)) for (const c of row[col] ?? '') if (isCjkChar(c)) used.add(c)
    sheetChars[lang] = [...used].sort().join('')

    const text = [...new Set([...used, ...eucCharset(CHARSET[lang]!), ...KANA, ...hangul])].filter(isCjkChar).join('')
    const source = readFileSync(require.resolve(SOURCE[lang]!))
    const woff2 = await subsetFont(source, text, { targetFormat: 'woff2' })
    const file = resolve(OUT, cjkFontFile(lang))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, woff2)
    console.log(`${lang}: ${used.size} characters in the sheet, ${[...text].length} in the font, ${Math.round(woff2.length / 1024)} KB`)
  }

  writeFileSync(CHARS, JSON.stringify(sheetChars, null, 1) + '\n', 'utf8')
  // The OFL travels with the fonts.
  writeFileSync(
    resolve(OUT, 'fusion-pixel-OFL.txt'),
    readFileSync(require.resolve('@fontsource/fusion-pixel-12px-proportional-jp/LICENSE'), 'utf8'),
  )
  console.log(`Unicode ranges: ${CJK_RANGES.map(([a, b]) => `U+${a.toString(16)}-${b.toString(16)}`).join(', ')}`)
}

void main()
