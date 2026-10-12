/**
 * pnpm raid-areas — the raid content of the areas (docs/24, the user's design of 2026-10-12).
 *
 * 1. The mythicals (DEFAULT_CONFIG.events.raid.pool) are their lairs' bosses again, with the numbers they had before the
 *    raids (00c4b09): plain boss fights, never shiny there. Their shiny raids are on the daily calendar.
 * 2. Every other area boss is a progression raid (`raid: true`): fought in its area once the area is completed.
 * 3. An area with a raid must be completable, or its raid would never open: an area without rounds gets one, and one
 *    with nothing to meet gets one round of a small wild pool: four species of its region's areas closest to it in
 *    level (fully evolved ones first, the ones seen most), at the area's levels — as the mythicals' lairs got in 00c4b09.
 * Writes src/data/areas.json; `pnpm seed-regions` applies `raidAreas` too, so rebuilding a region keeps it.
 * Safe to run again: an area already changed is left as it is.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CONFIG } from '../src/engine/defaults'
import type { Area, BossDef, Species } from '../src/engine/types'
import { stableUuid } from './seed'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AREAS = path.join(ROOT, 'src', 'data', 'areas.json')

/**
 * Each mythical's boss, as its lair had it before the raids. Melmetal never was one: Meltan evolves into it. Celebi and
 * Genesect wait for the round, the others can be challenged from the start.
 */
export const MYTHICAL_BOSSES: Readonly<Record<number, BossDef>> = {
  151: { dex: 151, level: 65, teamAvgThreshold: 0 },
  251: { dex: 251, level: 50 },
  385: { dex: 385, level: 60, teamAvgThreshold: 0 },
  386: { dex: 386, level: 65, teamAvgThreshold: 0 },
  489: { dex: 489, level: 50, teamAvgThreshold: 0 },
  490: { dex: 490, level: 55, teamAvgThreshold: 0 },
  491: { dex: 491, level: 60, teamAvgThreshold: 0 },
  492: { dex: 492, level: 60, teamAvgThreshold: 0 },
  493: { dex: 493, level: 70, teamAvgThreshold: 0 },
  494: { dex: 494, level: 30, teamAvgThreshold: 0 },
  647: { dex: 647, level: 55, teamAvgThreshold: 0 },
  648: { dex: 648, level: 50, teamAvgThreshold: 0 },
  649: { dex: 649, level: 60 },
  719: { dex: 719, level: 65, teamAvgThreshold: 0 },
  720: { dex: 720, level: 68, teamAvgThreshold: 0 },
  721: { dex: 721, level: 70, teamAvgThreshold: 0 },
  801: { dex: 801, level: 65, teamAvgThreshold: 0 },
  802: { dex: 802, level: 67, teamAvgThreshold: 0 },
  807: { dex: 807, level: 70, teamAvgThreshold: 0 },
  808: { dex: 808, level: 40, teamAvgThreshold: 0 },
  893: { dex: 893, level: 70, teamAvgThreshold: 0 },
  1025: { dex: 1025, level: 88, teamAvgThreshold: 0 },
}

/** Something to meet in a round: wild Pokémon or trainers, with a weight on their cards. */
const playable = (a: Area) =>
  (a.wildPool.some((w) => w.weight > 0) && a.encounterWeights.wild > 0) || (a.trainerPool.length > 0 && a.encounterWeights.trainer > 0)

/**
 * `legendary`: never added to a lair's wild pool (the egg-groups flag); `final`: the species doesn't evolve any further.
 */
export function raidAreas(areas: Area[], legendary: (dex: number) => boolean, final: (dex: number) => boolean): Area[] {
  const pool = DEFAULT_CONFIG.events.raid.pool
  const lairOf = new Map<string, number[]>()
  for (const p of pool) lairOf.set(p.areaId, [...(lairOf.get(p.areaId) ?? []), p.dex])
  const mythical = new Set(pool.map((p) => p.dex))
  // Every boss anywhere stays out of a new wild pool, the Ultra Beasts and the Paradox Pokémon included.
  const bossDex = new Set(areas.flatMap((a) => (a.legendaryBoss ?? []).map((b) => b.dex)))
  for (const d of mythical) bossDex.add(d)
  // A lair's own generated pool is no model for another's.
  const generated = (x: Area) => x.wildPool.length > 0 && x.wildPool.every((w) => w.id === stableUuid(`wild:raid-lair:${x.id}:${w.dex}`))

  return areas.map((a) => {
    // 1. The mythicals back as their lairs' bosses, in the pool's order, before any other boss.
    const lair = lairOf.get(a.id) ?? []
    const own = (a.legendaryBoss ?? []).filter((b) => !mythical.has(b.dex))
    const back = lair.map((d) => (a.legendaryBoss ?? []).find((b) => b.dex === d) ?? MYTHICAL_BOSSES[d]).filter((b): b is BossDef => !!b)
    // 2. Every other boss is a raid.
    const raids = own.map((b) => (b.raid ? b : { ...b, raid: true }))
    const bosses = [...back.map(({ raid: _r, ...b }) => b), ...raids]
    const changedBosses =
      bosses.length !== (a.legendaryBoss ?? []).length || bosses.some((b, i) => JSON.stringify(b) !== JSON.stringify(a.legendaryBoss?.[i]))
    let next: Area = changedBosses ? { ...a, legendaryBoss: bosses.length ? bosses : null } : a
    // 3. Completable: rounds, and something to meet in them.
    if (!raids.length && !back.length) return next
    if (next.roundsToClear == null) next = { ...next, roundsToClear: 1 }
    if (playable(next)) return next
    const region = a.regionId ?? 'kanto'
    const near = areas
      .filter((x) => (x.regionId ?? 'kanto') === region && x.id !== a.id && x.wildPool.length && !generated(x))
      .sort((x, y) => Math.abs(x.maxLevel - a.maxLevel) - Math.abs(y.maxLevel - a.maxLevel) || x.orderIndex - y.orderIndex)
      .slice(0, 3)
    const weight = new Map<number, number>()
    for (const x of near)
      for (const w of x.wildPool) if (w.weight > 0 && !legendary(w.dex) && !bossDex.has(w.dex)) weight.set(w.dex, (weight.get(w.dex) ?? 0) + w.weight)
    const rank = (dex: number) => (final(dex) ? 0 : 1)
    const picks = [...weight.entries()].sort((x, y) => rank(x[0]) - rank(y[0]) || y[1] - x[1] || x[0] - y[0]).slice(0, 4)
    const wildPool = next.wildPool.some((w) => w.weight > 0)
      ? next.wildPool
      : picks.map(([dex], i) => ({
          id: stableUuid(`wild:raid-lair:${a.id}:${dex}`),
          dex,
          weight: 10 - i * 2,
          minLevel: a.minLevel,
          maxLevel: a.maxLevel,
        }))
    const w = next.encounterWeights
    return { ...next, wildPool, encounterWeights: { ...w, wild: Math.max(w.wild, 8), center: Math.min(w.center, 1) } }
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
  for (const a of changed) {
    const bosses = (a.legendaryBoss ?? []).map((b) => `${b.raid ? 'raid' : 'boss'} #${b.dex}`).join(', ')
    console.log(`  · ${a.name}: ${bosses} · ${a.wildPool.length} wild, ${a.roundsToClear} round`)
  }
  console.log(`✓ ${changed.length} areas (src/data/areas.json)`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
