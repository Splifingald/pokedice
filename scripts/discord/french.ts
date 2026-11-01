// The French posts in #🥖-français: the patch notes and the live events, written again in French (DISCORD_FRENCH_WEBHOOK,
// docs/23-DISCORD-SERVER.md). The posts' own words live here, beside the English ones in each poster, as the rest of
// the Discord copy does; the content's names (items, areas, regions, the event types) come from the game's own sheet,
// so a post says "Hyper Ball" and "Bourg Palette" the way the game does in French.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { GameData, LiveType } from '@/engine'
import { parseCsv } from '@/i18n/csv'
import { areaKey, itemKey } from '@/i18n/names'
import { ROOT } from './env'

export type PostLang = 'en' | 'fr'

/** The sheet's French column, read from disk: src/i18n/index.ts imports it with Vite's `?raw`, which tsx can't load. */
let frTable: Record<string, string> | null = null
export function frenchTable(): Record<string, string> {
  if (frTable) return frTable
  frTable = {}
  const sheet = readSheet()
  if (!sheet) return frTable
  const rows = parseCsv(sheet)
  const col = (rows[0] ?? []).map((h) => h.trim()).indexOf('fr')
  for (const row of rows.slice(1)) {
    const key = (row[0] ?? '').trim()
    const value = row[col]
    if (key && !key.startsWith('#') && value) frTable[key] = value
  }
  return frTable
}

/** The sheet from the repository, or from beside the Netlify #events job (netlify.toml's included_files keeps its path
 * under the function's working directory). Missing, the French posts still go out, with the English names. */
function readSheet(): string | null {
  for (const root of [ROOT, process.cwd()]) {
    try {
      return readFileSync(path.join(root, 'src/i18n/strings.csv'), 'utf8')
    } catch {
      // Not there: the next place.
    }
  }
  console.warn('[french] src/i18n/strings.csv not found: the French posts use the English names')
  return null
}

/** The sheet's French for a key, else the English it falls back to (as the game does). */
export const fr = (key: string, english: string): string => frenchTable()[key] || english

/** The content with its French names: what the French posts list (items, areas, regions). */
export function frenchData(data: GameData): GameData {
  const items: GameData['items'] = {}
  for (const [key, item] of Object.entries(data.items))
    items[key] = { ...item, name: fr(itemKey(item.key), item.name) }
  return {
    ...data,
    items,
    areas: data.areas.map((a) => ({ ...a, name: fr(areaKey(a.name), a.name) })),
    regions: data.regions.map((r) => ({ ...r, name: fr(`region.${r.id}`, r.name) })),
  }
}

/** Each live event type's French name, as the game shows it. */
export const frenchTypeName = (type: LiveType, english: string): string => fr(`ui.live.${type}.name`, english)
