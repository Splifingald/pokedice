/**
 * pnpm import-bundle <path/to/pokedice-bundle.json>
 * Makes admin edits part of the offline default: splits the bundle downloaded from Admin → "Export bundle" into
 * src/data/*.json and regenerates supabase/seed.sql. Commit the result.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BundleRaw } from '../src/engine/types'
import { buildSql } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Also used by the dev server's "Pull from Supabase" admin button (vite.config.ts). */
export async function writeBundleFiles(b: BundleRaw) {
  const need = ['pokemon', 'typeChart', 'diceTypes', 'areas', 'trainers', 'upgrades', 'items', 'config'] as const
  for (const k of need) if (!(k in b)) throw new Error(`Bundle is missing "${k}"`)
  const out: Record<string, unknown> = {
    'pokemon.json': b.pokemon,
    'type-chart.json': b.typeChart,
    'dice-types.json': b.diceTypes,
    'areas.json': b.areas,
    'trainers.json': b.trainers,
    'upgrades.json': b.upgrades,
    'items.json': b.items,
    'config.json': b.config,
  }
  for (const [name, data] of Object.entries(out))
    await writeFile(path.join(ROOT, 'src', 'data', name), JSON.stringify(data, null, 1) + '\n')
  await writeFile(path.join(ROOT, 'supabase', 'seed.sql'), buildSql(b))
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: pnpm import-bundle <pokedice-bundle.json>')
  const b = JSON.parse(await readFile(path.resolve(file), 'utf8')) as BundleRaw
  await writeBundleFiles(b)
  console.log(`✓ imported ${b.pokemon.length} pokemon, ${b.areas.length} areas → src/data/*.json + supabase/seed.sql`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
