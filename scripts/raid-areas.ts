/**
 * pnpm raid-areas — the raid pool's areas (docs/18 §3, docs/19 §6.1, decision D1).
 *
 * The 23 mythicals of the raid pool (DEFAULT_CONFIG.events.raid.pool) stop being bosses of their areas: clearing the
 * area puts them in the player's raid pool instead. Those areas were legendary lairs with nothing else to do, so each
 * gets one round of a small wild pool: four species of its region's areas closest to it in level (fully evolved ones
 * first, the ones seen most), at the area's levels.
 * Writes src/data/areas.json; `pnpm seed-regions` applies `raidAreas` too, so rebuilding a region keeps it.
 * Safe to run again: an area already changed is left as it is.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import type { Area, Species } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREAS = path.join(ROOT, 'src', 'data', 'areas.json')

/**
 * `legendary`: never added to a lair's wild pool (the egg-groups flag); `final`: the species doesn't evolve any further.
 */
export function raidAreas(areas: Area[], legendary: (dex: number) => boolean, final: (dex: number) => boolean): Area[] {
  const pool = DEFAULT_CONFIG.events.raid.pool
  const byArea = new Map<string, number[]>()
  for (const p of pool) byArea.set(p.areaId, [...(byArea.get(p.areaId) ?? []), p.dex])
  // A lair's own new pool is no model for another's.
  const raidOnly = (x: Area) => byArea.has(x.id) && x.wildPool.every((w) => w.id === stableUuid(`wild:raid-lair:${x.id}:${w.dex}`))
  return areas.map((a) => {
    const raid = byArea.get(a.id)
    if (!raid) return a
    const bosses = (a.legendaryBoss ?? []).filter((b) => !raid.includes(b.dex))
    const playable = a.wildPool.length > 0 && a.roundsToClear != null && a.encounterWeights.wild > 0
    if (bosses.length === (a.legendaryBoss ?? []).length && playable) return a
    const changed = { ...a, legendaryBoss: bosses.length ? bosses : null }
    if (playable) return changed
    // The region's three areas closest to this one in level: their wild species, fully evolved first, most seen first.
    const region = a.regionId ?? 'kanto'
    const near = areas
      .filter((x) => (x.regionId ?? 'kanto') === region && x.id !== a.id && x.wildPool.length && !raidOnly(x))
      .sort((x, y) => Math.abs(x.maxLevel - a.maxLevel) - Math.abs(y.maxLevel - a.maxLevel) || x.orderIndex - y.orderIndex)
      .slice(0, 3)
    const weight = new Map<number, number>()
    for (const x of near) for (const w of x.wildPool) if (w.weight > 0 && !legendary(w.dex)) weight.set(w.dex, (weight.get(w.dex) ?? 0) + w.weight)
    const rank = (dex: number) => (final(dex) ? 0 : 1)
    const picks = [...weight.entries()].sort((x, y) => rank(x[0]) - rank(y[0]) || y[1] - x[1] || x[0] - y[0]).slice(0, 4)
    const wildPool = changed.wildPool.length
      ? changed.wildPool
      : picks.map(([dex], i) => ({
          id: stableUuid(`wild:raid-lair:${a.id}:${dex}`),
          dex,
          weight: 10 - i * 2,
          minLevel: a.minLevel,
          maxLevel: a.maxLevel,
        }))
    const w = changed.encounterWeights
    return {
      ...changed,
      roundsToClear: changed.roundsToClear ?? 1,
      wildPool,
      encounterWeights: { ...w, wild: Math.max(w.wild, 8), center: Math.min(w.center, 1) },
    }
  })
}

async function main() {
  const areas = JSON.parse(await readFile(AREAS, 'utf8')) as Area[]
  const eggs = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'egg-groups.json'), 'utf8')) as Record<string, { l?: number }>
  const species = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'pokemon.json'), 'utf8')) as Species[]
  const evolves = new Set(species.filter((s) => s.evolutions.length).map((s) => s.dex))
  const next = raidAreas(
    areas,
    (dex) => !!eggs[String(dex)]?.l,
    (dex) => !evolves.has(dex),
  )
  const changed = next.filter((a, i) => a !== areas[i])
  await writeFile(AREAS, `${JSON.stringify(next, null, 1)}\n`)
  for (const a of changed) console.log(`  · ${a.name}: ${a.wildPool.length} wild, ${a.roundsToClear} round`)
  console.log(`✓ ${changed.length} raid lairs (src/data/areas.json)`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
