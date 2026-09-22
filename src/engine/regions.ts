/**
 * Regions: Kanto, Johto, Hoenn. Each is a self-contained run — its own areas, Box, bag, ₽, upgrade tracks and
 * Pokédex — and the player carries only their character between them. Nothing pools, ever: what a region holds
 * stays in it. The one thread between them is `sendPokemonOn`, which walks a single Pokémon one region forward.
 *
 * The save keeps the **live** region at the top level of `SaveData`, exactly where it has always been, and parks the
 * others in `save.parked`. So every engine function and every screen goes on reading `save.box` and `save.gold`
 * without knowing regions exist; switching region is a swap of those fields, and nothing else changes.
 */
import { linearAreas } from './data'
import { isReviving } from './fossils'
import type { BadgeInfo } from './run'
import {
  COMBO_KEYS,
  POKE_TYPES,
  type ComboKey,
  type GameData,
  type PokeType,
  type PokemonInstance,
  type Region,
  type RegionId,
  type RegionSave,
  type SaveData,
} from './types'

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
 * Whether a species may be evolved into yet: cross-generation evolutions wait for the region they come from.
 *
 * Kanto is full of Pokémon that gained an evolution in a later game — Golbat into Crobat, Chansey into Blissey, Eevee
 * into Umbreon, Onix into Steelix. Those branches live on the Kanto species rows, because they are the same Pokémon,
 * but a player in Kanto must not meet a Gen 2 Pokémon: it would spoil a region they may not even have been offered
 * yet and drop a #169 into a Pokédex that ends at #151.
 *
 * The gate is on **where you are standing**, not on what you have unlocked: a region only ever shows its own
 * generation and the ones before it. So a Golbat evolves into a Crobat in Johto or any later region, and never in
 * Kanto — not even once Johto is done, because the Kanto Pokédex still ends at #151 and its Box is Kanto's.
 *
 * A species in no region's range (content ahead of the regions table) is always allowed, so this can never be the
 * thing that makes a Pokémon unobtainable.
 */
export function evolutionGate(save: SaveData, data: GameData): (dex: number) => boolean {
  return speciesAllowedIn(data, regionOf(save))
}

/** The same rule, for a region rather than a save — what `regionSpecies` counts and what `evolutionGate` allows. */
export function speciesAllowedIn(data: GameData, regionId: RegionId): (dex: number) => boolean {
  const here = getRegion(data, regionId)
  // Standing in a region the table does not know: gate nothing rather than lock everything away.
  const open = new Set(data.regions.filter((r) => !here || r.orderIndex <= here.orderIndex).map((r) => r.id))
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
 * Every species a region can give you, by any route: its wild pools, its legendaries, its starters, the Pokémon its
 * fossils revive into, the Game Corner prize where it has a Game Corner — and everything all of those evolve into.
 * This — not a dex number range — is what a region's Pokédex page counts, because a region's routes borrow freely
 * from earlier generations and a player should be able to see everything they can actually get here.
 *
 * Counting only the wild pools is what left holes in the page. Omanyte, Kabuto and Aerodactyl are wild nowhere (they
 * come out of a fossil, see engine/fossils.ts) and Porygon is won at the Game Corner, so #137, #138, #140 and #142
 * were missing from Kanto's Pokédex — and a revived Omanyte had nowhere to show up at all. Evolved forms went the
 * same way wherever the grass holds only the first stage: Cradily and Armaldo in Hoenn, and in Johto a long list of
 * Gen 1 finals — Pidgeot, Alakazam, Machamp, Gengar — whose families are all over the routes.
 *
 * The evolution pass obeys `speciesAllowedIn`, the very rule `evolutionGate` enforces, so the page can never promise
 * an evolution the game would refuse: Kanto's Zubat does not put a Crobat on Kanto's page, Johto's does on Johto's.
 */
export function regionSpecies(data: GameData, regionId: RegionId): Set<number> {
  const out = new Set<number>(getRegion(data, regionId)?.starters ?? [])
  let hasGameCorner = false
  for (const area of data.areas) {
    if (regionOfArea(area) !== regionId) continue
    for (const w of area.wildPool) if (w.weight > 0) out.add(w.dex)
    for (const b of area.legendaryBoss ?? []) out.add(b.dex)
    // A fossil in the loot is the Pokémon it revives into.
    for (const l of area.lootPool) {
      const fx = data.items[l.itemKey]?.effect
      if (fx?.kind === 'fossil' && data.species[fx.dex]) out.add(fx.dex)
    }
    if ((area.encounterWeights.casino ?? 0) > 0) hasGameCorner = true
  }
  if (hasGameCorner && data.species[data.config.slotMachine.prizeDex]) out.add(data.config.slotMachine.prizeDex)
  // The roamers belong to their region without sitting in any one area (see engine/encounters.ts).
  for (const dex of data.config.roamers?.regionId === regionId ? (data.config.roamers?.dex ?? []) : []) out.add(dex)

  // Whatever all of that evolves into is yours here too. Iterating the Set as it grows walks a line to its end:
  // Magikarp adds Gyarados, and Gyarados is then visited in the same pass.
  const allowed = speciesAllowedIn(data, regionId)
  for (const dex of out) {
    for (const e of data.species[dex]?.evolutions ?? []) {
      if (!out.has(e.toDex) && data.species[e.toDex] && allowed(e.toDex)) out.add(e.toDex)
    }
  }
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
    ...(save.boughtUnique ? { boughtUnique: save.boughtUnique } : {}),
  }
}

/** Puts a block back at the top level, as the live region. */
function withBlock(save: SaveData, regionId: RegionId, block: RegionSave): SaveData {
  const { dayCare: _drop, boughtUnique: _alsoDrop, ...rest } = save
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
    ...(block.boughtUnique ? { boughtUnique: block.boughtUnique } : {}),
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
 * The region a Pokémon can be sent on to from here: the one after this, once this region's league is done and that
 * region has actually been started. Null the rest of the time, which is what keeps the button out of sight.
 *
 * Regions do not pool: a Box, a bag, a purse and an upgrade track belong to one region for good. Sending a Pokémon
 * on is the single thread between them, and it goes one hop forward at a time — Kanto to Johto, then Johto to Hoenn
 * once Johto's league has fallen too.
 */
export function sendOnTarget(save: SaveData, data: GameData): Region | null {
  const here = getRegion(data, regionOf(save))
  if (!here?.nextRegion || !leagueDone(save, data, here.id)) return null
  const next = getRegion(data, here.nextRegion)
  // It has to be a region being played: its parked block is the Box the Pokémon arrives in.
  if (!next || (!next.enabled && next.id !== KANTO) || !save.parked?.[next.id]) return null
  return next
}

/** Why this Pokémon cannot go, or null when it can. */
export type SendBlock = 'species' | 'last' | 'reviving'

/**
 * A Pokémon may go on only if the region it is going to could have given it to the player itself — the same set its
 * Pokédex page counts. A fossil still reviving stays put, and so does the last Pokémon in the Box: emptying a region
 * would leave nothing to play it with.
 */
export function sendOnBlocked(save: SaveData, data: GameData, inst: PokemonInstance, target: Region): SendBlock | null {
  if (isReviving(inst)) return 'reviving'
  if (!regionSpecies(data, target.id).has(inst.dex)) return 'species'
  if (save.box.filter((p) => !isReviving(p)).length <= 1) return 'last'
  return null
}

/**
 * Moves one Pokémon out of the live region and into the next one's parked Box, where it is the player's to use the
 * moment they travel. It leaves the team behind it — and if it was the whole team, the Box promotes a replacement,
 * because a region with nobody in its team cannot be played.
 *
 * It also enters the target's Pokédex: it is sitting in that Box, and a Pokémon you own reading as never seen is
 * the kind of thing that looks broken.
 */
export function sendPokemonOn(save: SaveData, data: GameData, instId: string): SaveData | null {
  const target = sendOnTarget(save, data)
  if (!target) return null
  const inst = save.box.find((p) => p.id === instId)
  if (!inst || sendOnBlocked(save, data, inst, target)) return null
  const block = save.parked?.[target.id]
  if (!block) return null

  const box = save.box.filter((p) => p.id !== instId)
  let team = save.team.filter((id) => id !== instId)
  if (!team.length) {
    const heir = box.find((p) => !isReviving(p))
    if (!heir) return null
    team = [heir.id]
  }
  return {
    ...save,
    box,
    team,
    parked: {
      ...save.parked,
      [target.id]: {
        ...block,
        box: [...block.box, inst],
        pokedex: block.pokedex.includes(inst.dex) ? block.pokedex : [...block.pokedex, inst.dex],
      },
    },
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

/** One region on the trainer card: its badges, and whether its last area is behind the player. */
export interface RegionCase {
  id: RegionId
  name: string
  badges: BadgeInfo[]
  earned: number
  /** Its league area is cleared — the crown on the card. */
  endgameCleared: boolean
}

/**
 * The badge case of every region the player has reached, live or parked. `badgeCase` only ever describes the live
 * region, because every other engine function reads the live block; here the parked blocks are read directly, which
 * is the one place that needs to look across all of them at once.
 */
export function regionCases(save: SaveData, data: GameData): RegionCase[] {
  return unlockedRegions(save, data).map((region) => {
    const live = regionOf(save) === region.id
    const progress = live ? save.areaProgress : (save.parked?.[region.id]?.areaProgress ?? {})
    const badges: BadgeInfo[] = []
    for (const area of regionAreas(data, region.id)) {
      const defeated = progress[area.id]?.gymsDefeated ?? []
      for (const id of area.gyms) {
        const trainer = data.trainers[id]
        if (trainer?.badge)
          badges.push({ trainerId: id, areaId: area.id, leader: trainer.name, badge: trainer.badge, earned: defeated.includes(id) })
      }
    }
    return {
      id: region.id,
      name: region.name,
      badges,
      earned: badges.filter((b) => b.earned).length,
      endgameCleared: !!progress[region.leagueAreaId]?.cleared,
    }
  })
}
