/**
 * Regions: Kanto, Johto, Hoenn. Each is a self-contained run — its own areas, Box, bag, ₽, upgrade tracks and
 * Pokédex — and the player carries only their character between them.
 *
 * The save keeps the **live** region at the top level of `SaveData`, exactly where it has always been, and parks the
 * others in `save.parked`. So every engine function and every screen goes on reading `save.box` and `save.gold`
 * without knowing regions exist; switching region is a swap of those fields, and nothing else changes.
 */
import { linearAreas } from './data'
import { COMBO_KEYS, POKE_TYPES, type ComboKey, type GameData, type PokeType, type Region, type RegionId, type RegionSave, type SaveData } from './types'

export const KANTO: RegionId = 'kanto'

/** The region a save is in. Saves from before the second region are Kanto. */
export const regionOf = (save: SaveData): RegionId => save.region ?? KANTO

/** The region an area belongs to. Areas from before the second region are Kanto. */
export const regionOfArea = (area: { regionId?: RegionId }): RegionId => area.regionId ?? KANTO

export function getRegion(data: GameData, id: RegionId): Region | undefined {
  return data.regions.find((r) => r.id === id)
}

/** Regions in order, minus any switched off in Admin. Kanto is never switched off. */
export function enabledRegions(data: GameData): Region[] {
  return data.regions.filter((r) => r.enabled || r.id === KANTO).sort((a, b) => a.orderIndex - b.orderIndex)
}

/**
 * The regions the player can see: the ones they have started (live or parked) that are still enabled. Before the
 * first league is won this is Kanto alone, which is what keeps every other region unmentioned in the UI.
 */
export function unlockedRegions(save: SaveData, data: GameData): Region[] {
  const started = new Set<RegionId>([regionOf(save), ...Object.keys(save.parked ?? {})])
  return enabledRegions(data).filter((r) => started.has(r.id))
}

/**
 * The region a species *belongs* to — the region whose `dexRange` covers its number. Unlike `regionSpecies`, which
 * asks where you can catch something, this asks which generation it is from, and that is what decides whether a
 * Pokémon exists for you yet.
 */
export function regionOfSpecies(data: GameData, dex: number): RegionId | null {
  return data.regions.find((r) => dex >= r.dexRange[0] && dex <= r.dexRange[1])?.id ?? null
}

/**
 * Whether a species may be evolved into yet: cross-generation evolutions wait for their generation.
 *
 * Kanto is full of Pokémon that gained an evolution in a later game — Golbat into Crobat, Chansey into Blissey, Eevee
 * into Umbreon, Onix into Steelix. Those branches live on the Kanto species rows, because they are the same Pokémon,
 * but a player still working through the Indigo League must not meet a Gen 2 Pokémon: it would spoil a region they
 * have not been offered yet and drop a #169 into a Pokédex that ends at #151. So the evolution is held until the
 * region it comes from is unlocked. Reach Johto and your Golbat evolves — in Johto, and in Kanto too when you come
 * back, because by then you have seen a Crobat.
 *
 * A species in no region's range (content ahead of the regions table) is always allowed, so this can never be the
 * thing that makes a Pokémon unobtainable.
 */
export function evolutionGate(save: SaveData, data: GameData): (dex: number) => boolean {
  const open = new Set(unlockedRegions(save, data).map((r) => r.id))
  return (dex) => {
    const from = regionOfSpecies(data, dex)
    return from === null || open.has(from)
  }
}

/** The areas of one region's main chain, in order. */
export function regionAreas(data: GameData, regionId: RegionId) {
  return linearAreas(data).filter((a) => regionOfArea(a) === regionId)
}

/**
 * Every species a region can give you: its wild pools, its legendaries and its starters. This — not a dex number
 * range — is what a region's Pokédex page counts, because a region's routes borrow freely from earlier generations
 * and a player should be able to see everything they can actually catch here.
 */
export function regionSpecies(data: GameData, regionId: RegionId): Set<number> {
  const out = new Set<number>(getRegion(data, regionId)?.starters ?? [])
  for (const area of data.areas) {
    if (regionOfArea(area) !== regionId) continue
    for (const w of area.wildPool) if (w.weight > 0) out.add(w.dex)
    for (const b of area.legendaryBoss ?? []) out.add(b.dex)
  }
  // The roamers belong to their region without sitting in any one area (see engine/encounters.ts).
  for (const dex of data.config.roamers?.regionId === regionId ? (data.config.roamers?.dex ?? []) : []) out.add(dex)
  return out
}

/** Has this region's league been beaten? — its league area cleared. */
export function leagueDone(save: SaveData, data: GameData, regionId = regionOf(save)): boolean {
  const region = getRegion(data, regionId)
  if (!region) return false
  const progress = regionId === regionOf(save) ? save.areaProgress : save.parked?.[regionId]?.areaProgress
  return !!progress?.[region.leagueAreaId]?.cleared
}

/**
 * The region on offer, if any: the next one after a region whose league is done, not started yet and still enabled.
 * Null the rest of the time — including before the first league, which is why nothing names Johto until then.
 */
export function offeredRegion(save: SaveData, data: GameData): Region | null {
  const started = new Set<RegionId>([regionOf(save), ...Object.keys(save.parked ?? {})])
  for (const region of enabledRegions(data)) {
    if (!region.nextRegion || started.has(region.nextRegion)) continue
    if (!leagueDone(save, data, region.id)) continue
    const next = getRegion(data, region.nextRegion)
    if (next && (next.enabled || next.id === KANTO)) return next
  }
  return null
}

// ---------------------------------------------------------------- the block swap

/** Lifts the live region's fields out of the save. */
export function liveBlock(save: SaveData): RegionSave {
  return {
    gold: save.gold,
    pokedex: save.pokedex,
    box: save.box,
    team: save.team,
    inventory: save.inventory,
    comboLevels: save.comboLevels,
    dieLevels: save.dieLevels,
    currentAreaId: save.currentAreaId,
    areaProgress: save.areaProgress,
    ...(save.dayCare ? { dayCare: save.dayCare } : {}),
  }
}

/** Puts a block back at the top level, as the live region. */
function withBlock(save: SaveData, regionId: RegionId, block: RegionSave): SaveData {
  const { dayCare: _drop, ...rest } = save
  return {
    ...rest,
    region: regionId,
    gold: block.gold,
    pokedex: block.pokedex,
    box: block.box,
    team: block.team,
    inventory: block.inventory,
    comboLevels: block.comboLevels,
    dieLevels: block.dieLevels,
    currentAreaId: block.currentAreaId,
    areaProgress: block.areaProgress,
    ...(block.dayCare ? { dayCare: block.dayCare } : {}),
  }
}

/** A fresh region: the chosen starter, an empty everything else, upgrade tracks back to level 1. */
export function newRegionBlock(
  region: Region,
  starterDex: number,
  data: GameData,
  now: number,
  newId: () => string,
  createInstance: (dex: number, level: number, data: GameData, id: string, now: number) => RegionSave['box'][number],
): RegionSave {
  const inst = createInstance(starterDex, region.starterLevel, data, newId(), now)
  const first = regionAreas(data, region.id)[0]
  return {
    gold: 0,
    pokedex: [starterDex],
    box: [inst],
    team: [inst.id],
    inventory: Object.fromEntries(Object.entries(data.config.startInventory ?? {}).filter(([k, q]) => data.items[k] && q > 0)),
    comboLevels: Object.fromEntries(COMBO_KEYS.map((k) => [k, 1])) as Record<ComboKey, number>,
    dieLevels: Object.fromEntries(POKE_TYPES.map((t) => [t, 1])) as Record<PokeType, number>,
    currentAreaId: first?.id ?? '',
    areaProgress: {},
  }
}

/**
 * Moves to another region: the live block is parked, the target's block takes its place. The target must already
 * exist — `startRegion` is what creates one.
 */
export function switchRegion(save: SaveData, to: RegionId): SaveData {
  const from = regionOf(save)
  if (from === to) return save
  const block = save.parked?.[to]
  if (!block) return save
  const parked = { ...(save.parked ?? {}) }
  delete parked[to]
  parked[from] = liveBlock(save)
  return withBlock({ ...save, parked }, to, block)
}

/** Starts a region on a chosen starter and moves into it. The region being left is parked, untouched. */
export function startRegion(save: SaveData, region: Region, block: RegionSave): SaveData {
  const from = regionOf(save)
  const parked = { ...(save.parked ?? {}) }
  delete parked[region.id]
  if (from !== region.id) parked[from] = liveBlock(save)
  return withBlock({ ...save, parked }, region.id, block)
}

/**
 * Beating a region's league gives its earlier regions' things back: their Box, bag and ₽ fold into the live region,
 * once. Their parked blocks keep their Pokédex and progress, so switching back still shows everything they did — but
 * their Box and bag are now empty, because those Pokémon and items are here.
 *
 * Upgrade tracks take the best of the merged regions, rather than adding up: a track is a level, not a balance.
 */
export function mergeEarlierRegions(save: SaveData, data: GameData): { save: SaveData; merged: RegionId[]; gained: number } {
  const live = regionOf(save)
  const region = getRegion(data, live)
  if (!region || !leagueDone(save, data, live)) return { save, merged: [], gained: 0 }

  const already = new Set(save.merged ?? [])
  const earlier = enabledRegions(data).filter((r) => r.orderIndex < region.orderIndex && !already.has(r.id))
  const sources = earlier.filter((r) => save.parked?.[r.id])
  if (!sources.length) return { save, merged: [], gained: 0 }

  const parked = { ...(save.parked ?? {}) }
  let box = [...save.box]
  const inventory = { ...save.inventory }
  let gold = save.gold
  const comboLevels = { ...save.comboLevels }
  const dieLevels = { ...save.dieLevels }
  let gained = 0

  for (const r of sources) {
    const block = parked[r.id]!
    box = [...box, ...block.box]
    gained += block.box.length
    for (const [key, qty] of Object.entries(block.inventory)) inventory[key] = (inventory[key] ?? 0) + qty
    gold += block.gold
    for (const k of COMBO_KEYS) comboLevels[k] = Math.max(comboLevels[k], block.comboLevels[k] ?? 1)
    for (const t of POKE_TYPES) dieLevels[t] = Math.max(dieLevels[t], block.dieLevels[t] ?? 1)
    // The region keeps its Pokédex and its progress; what has moved here is no longer there.
    parked[r.id] = { ...block, box: [], team: [], inventory: {}, gold: 0 }
  }

  return {
    save: { ...save, parked, box, inventory, gold, comboLevels, dieLevels, merged: [...already, ...sources.map((r) => r.id)] },
    merged: sources.map((r) => r.id),
    gained,
  }
}

/**
 * A region switched off in Admin must not strand whoever is standing in it: they are moved back to the most recent
 * region they can still play, and their block stays parked exactly as it was for when it is switched back on.
 */
export function rescueFromDisabledRegion(save: SaveData, data: GameData): { save: SaveData; from: Region } | null {
  const live = regionOf(save)
  const region = getRegion(data, live)
  if (!region || region.enabled || live === KANTO) return null
  const open = unlockedRegions(save, data)
  const target = [...open].reverse().find((r) => r.id !== live) ?? getRegion(data, KANTO)
  if (!target || !save.parked?.[target.id]) return null
  return { save: switchRegion(save, target.id), from: region }
}
