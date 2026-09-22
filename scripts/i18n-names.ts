/**
 * Refreshes the `pokemon.*` and `item.*` rows of src/i18n/strings.csv from PokeAPI, which is where the
 * official French, Spanish and German names live. Every other row in the sheet is left untouched.
 *
 *   pnpm i18n:names
 *
 * The source is PokeAPI's static export on raw.githubusercontent, not pokeapi.co: the live API is unreachable from
 * CI and from the sandbox, and the mirror answers the same JSON under `<endpoint>/index.json`. The mirror keys items
 * by numeric id rather than by name, so `item/index.json` is fetched once and used to look the ids up.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pokemon from '../src/data/pokemon.json'
import items from '../src/data/items.json'
import { parseCsv } from '../src/i18n/csv'
import { LANGS } from '../src/i18n/langs'

const SHEET = resolve(import.meta.dirname, '../src/i18n/strings.csv')
const API = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2'

interface NameRow {
  name: string
  language: { name: string }
}

async function names(endpoint: string): Promise<Record<string, string>> {
  const url = `${API}/${endpoint}/index.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  const json = (await res.json()) as { names: NameRow[] }
  const out: Record<string, string> = {}
  for (const n of json.names) if ((LANGS as readonly string[]).includes(n.language.name)) out[n.language.name] = n.name
  return out
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csvRow = (cells: string[]) => cells.map(csvCell).join(',')

async function main() {
  const rows = new Map<string, string[]>()

  const dexes = [...new Set((pokemon as { dex: number }[]).map((p) => p.dex))].sort((a, b) => a - b)
  for (const dex of dexes) {
    const n = await names(`pokemon-species/${dex}`)
    rows.set(`pokemon.${dex}`, [`pokemon.${dex}`, ...LANGS.map((l) => n[l] ?? '')])
    process.stdout.write(`\rpokemon ${dex}/${dexes[dexes.length - 1]}   `)
  }

  const list = (await (await fetch(`${API}/item/index.json`)).json()) as { results: { name: string; url: string }[] }
  const itemIds = new Map(list.results.map((r) => [r.name, r.url.replace(/\/+$/, '').split('/').pop()!]))
  for (const it of items as { key: string }[]) {
    const id = itemIds.get(it.key)
    if (!id) throw new Error(`no such item on the mirror: ${it.key}`)
    const n = await names(`item/${id}`)
    rows.set(`item.${it.key}`, [`item.${it.key}`, ...LANGS.map((l) => n[l] ?? '')])
    process.stdout.write(`\ritem ${it.key}            `)
  }
  process.stdout.write('\n')

  // Rewrite the managed rows in place; keep the order and every other row of the sheet.
  const existing = parseCsv(readFileSync(SHEET, 'utf8'))
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of existing) {
    const key = (row[0] ?? '').trim()
    const fresh = rows.get(key)
    if (fresh) {
      out.push(csvRow(fresh))
      seen.add(key)
    } else out.push(csvRow(row))
  }
  for (const [key, row] of rows) if (!seen.has(key)) out.push(csvRow(row))
  writeFileSync(SHEET, out.join('\n') + '\n', 'utf8')
  console.log(`${rows.size} name rows written to ${SHEET}`)
}

void main()
