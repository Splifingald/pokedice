// What Home says about areas: each one's state (where you are, cleared, next, a new secret, locked and why), the region
// at a glance, and the secret area to show off. Reads the engine's rules; decides nothing itself.
import {
  conditionStatus,
  isAreaClosed,
  isAreaUnlocked,
  linearAreas,
  progressOf,
  regionOf,
  regionOfArea,
  regionSpecies,
  type Area,
  type GameData,
  type RegionId,
  type SaveData,
} from '@/engine'
import { t } from '@/i18n'
import { conditionLabel } from '@/i18n/text'
import { searchFold } from '@/i18n'

/** here · cleared · next (open, not cleared yet) · new (a secret never played) · open (a secret) · locked */
export type AreaStatus = 'here' | 'cleared' | 'next' | 'new' | 'open' | 'locked'

/** The species an area's wild pool can give (each once). */
export const areaSpecies = (area: Area): number[] => [
  ...new Set(area.wildPool.filter((w) => w.weight > 0).map((w) => w.dex)),
]

/** A secret area is new until it has been played once (it has progress of its own). */
const played = (save: SaveData, area: Area) => !!save.areaProgress[area.id]

export function areaStatus(save: SaveData, data: GameData, area: Area): AreaStatus {
  if (!isAreaUnlocked(save, area.id, data)) return 'locked'
  if (area.id === save.currentAreaId) return 'here'
  if (progressOf(save, area.id).cleared) return 'cleared'
  if (area.hidden) return played(save, area) ? 'open' : 'new'
  return 'next'
}

/** Why an area is locked, in words: "Clear Route 3", "Catch 60 Pokémon · 41/60". */
export function lockReason(save: SaveData, data: GameData, area: Area): string {
  if (!area.hidden) {
    const chain = linearAreas(data, regionOfArea(area))
    const prev = chain[chain.findIndex((a) => a.id === area.id) - 1]
    return t('ui.map.clearFirst', { area: prev?.name ?? t('ui.unlock.unknownArea') })
  }
  const unmet = (area.unlockConditions ?? [])
    .map((c) => ({ c, s: conditionStatus(c, save, data) }))
    .find((x) => !x.s.met)
  if (!unmet) return ''
  const label = conditionLabel(unmet.c, data)
  return unmet.c.kind === 'area'
    ? label
    : `${label} · ${Math.min(unmet.s.current, unmet.s.target)}/${unmet.s.target}`
}

/** The areas of a region: its chain in order, then its secret areas. */
export function regionAreaList(data: GameData, region: RegionId): Area[] {
  const chain = linearAreas(data, region)
  const secrets = data.areas.filter((a) => a.hidden && regionOfArea(a) === region)
  return [...chain, ...secrets]
}

/** The region at a glance: cleared areas, secrets found, species caught. */
export function regionSummary(save: SaveData, data: GameData, region: RegionId = regionOf(save)) {
  const areas = regionAreaList(data, region)
  const secrets = areas.filter((a) => a.hidden)
  const species = regionSpecies(data, region)
  const dex = new Set(save.pokedex)
  return {
    areas: areas.length,
    cleared: areas.filter((a) => progressOf(save, a.id).cleared).length,
    secretsFound: secrets.filter((a) => isAreaUnlocked(save, a.id, data)).length,
    secrets: secrets.length,
    caught: [...species].filter((d) => dex.has(d)).length,
    species: species.size,
  }
}

/**
 * The secret area Home shows off: a new one (opened, never played) to travel to; else the locked one closest to
 * opening, with its progress; else none.
 */
export function featuredSecret(
  save: SaveData,
  data: GameData,
): { area: Area; fresh: true } | { area: Area; fresh: false; current: number; target: number } | null {
  const secrets = data.areas.filter((a) => a.hidden && regionOfArea(a) === regionOf(save))
  const fresh = secrets.find((a) => areaStatus(save, data, a) === 'new')
  if (fresh) return { area: fresh, fresh: true }
  let best: { area: Area; current: number; target: number; k: number } | null = null
  for (const a of secrets) {
    if (isAreaUnlocked(save, a.id, data)) continue
    const unmet = (a.unlockConditions ?? []).map((c) => conditionStatus(c, save, data)).filter((s) => !s.met)
    const s = unmet[0]
    if (!s || unmet.length > 1 || s.target <= 0) continue
    const k = s.current / s.target
    if (!best || k > best.k) best = { area: a, current: s.current, target: s.target, k }
  }
  return best ? { area: best.area, fresh: false, current: best.current, target: best.target } : null
}

/** Something new in the Areas list: a secret area opened and never played. */
export const hasNewSecret = (save: SaveData, data: GameData) =>
  data.areas.some(
    (a) => a.hidden && regionOfArea(a) === regionOf(save) && areaStatus(save, data, a) === 'new',
  )

/** Search by area name or by Pokémon name: the species of `area` whose (folded) names hold the query. */
export function areaSearch(area: Area, data: GameData, query: string): { name: boolean; hits: number[] } {
  const q = searchFold(query.trim())
  if (!q) return { name: true, hits: [] }
  return {
    name: searchFold(area.name).includes(q),
    hits: areaSpecies(area).filter((d) => searchFold(data.species[d]?.name ?? '').includes(q)),
  }
}

/** The area can be played: open, and not closed (nothing left to meet there). */
export const playable = (save: SaveData, data: GameData, area: Area) =>
  isAreaUnlocked(save, area.id, data) && !isAreaClosed(save, area.id, data)
