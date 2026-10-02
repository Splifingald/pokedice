// strings.csv → one table per language. Shared by the Vite plugin that serves each language as its own module
// (vite.config.ts → i18nSheet), so nothing here may import the CSV itself.
import { parseCsv } from './csv'
import { LANGS, type Lang } from './langs'

/** Every language's non-empty cells, by key. Comment rows (`# …`) and blank keys are skipped. */
export function sheetTables(sheet: string): Record<Lang, Record<string, string>> {
  const out = Object.fromEntries(LANGS.map((l) => [l, {}])) as Record<Lang, Record<string, string>>
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
