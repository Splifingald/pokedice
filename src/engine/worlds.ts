// Small worlds (docs/21): a time-limited, themed region of its own, built in the admin, where the shiny mythicals are
// won. A world is a region row (Config → Regions) named by a world of `smallWorlds.list`; the save holds it like any
// region (its own Box, bag, ₽ and areas, parked while elsewhere), plus `events.world` saying which world it is and
// where the player came from. One world runs at a time, on the server's clock; when it ends, its block is deleted and
// only the mythical, already sent home when it was caught, is left of it.
//
// Its rules: a fresh start on one of three partners; areas that may wait for a date as well as for the one before; ×
// XP; no upgrades (dice and combos follow each Pokémon's level, both sides); booster types (× damage, both sides, always
// shown); its own Mart; a shiny mythical at the end. No event reaches inside, and the Day Care, Versus and the region
// chain are the main game's.
import type { UpgradeLevels } from './damage'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { addFossil } from './fossils'
import { sellPrice } from './items'
import { badgesHeld, liveLeft, liveState } from './liveEvents'
import { createInstance } from './progression'
import { addToRegion } from './raid'
import {
  getRegion,
  isWorldRegion,
  KANTO,
  newRegionBlock,
  realRegions,
  regionAreas,
  regionOf,
  regionOfSpecies,
  startRegion,
  switchRegion,
} from './regions'
import type { RunEvent } from './run'
import type { GameData, ItemDef, RegionId, SaveData, SmallWorld, WorldCatch, WorldSave } from './types'
import { smallWorlds, worldById, worldOfArea, worldOfRegion } from './worldList'

export { isWorldMythical, newSmallWorld, normaliseWorld, smallWorlds, worldById, worldOfArea, worldOfRegion } from './worldList'

const at = (iso: string): number => Date.parse(iso)

/** Where a world stands at `now`: before its start, running (start included, end excluded) or over. */
export const worldState = (w: Pick<SmallWorld, 'start' | 'end'>, now: number) => liveState(w, now)

/** Time left (ms), and the share of the world still to come (1 → 0), for the countdown and its gauge. */
export const worldLeft = (w: Pick<SmallWorld, 'start' | 'end'>, now: number) => liveLeft(w, now)

/** Switched on for whoever is playing: for everyone, or the admin alone (Off by default). */
export const worldsOn = (data: GameData): boolean => eventOpenTo(data.config.smallWorlds?.access, data)

/** The world running at that server time, switched on and its region known; null while the time is unknown. */
export function worldAt(data: GameData, now: number | null): SmallWorld | null {
  if (now == null || !worldsOn(data)) return null
  return smallWorlds(data).find((w) => worldState(w, now) === 'live' && !!getRegion(data, w.regionId)) ?? null
}

/** The world open to this player: running, switched on for them, in the main save, from its badge count on. */
export function worldFor(save: SaveData, data: GameData, now: number | null): SmallWorld | null {
  if (isExtreme(save)) return null
  const w = worldAt(data, now)
  return w && badgesHeld(save, data) >= w.minBadges ? w : null
}

// ------------------------------------------------------------------ the world a save holds

/** The world this save holds (entered, not closed), whatever the clock says. */
export function heldWorld(save: Pick<SaveData, 'events'>): WorldSave | null {
  const w = save.events?.world
  return w && !w.closed ? w : null
}

/** The live region is the world this save holds (or a world's region, if the save never said so). */
export function inWorld(save: SaveData, data: GameData): boolean {
  const live = regionOf(save)
  return heldWorld(save)?.regionId === live || isWorldRegion(data, live)
}

/** The world being played, with its settings; null outside one, or while the content doesn't know it yet. */
export function currentWorld(save: SaveData, data: GameData): SmallWorld | null {
  if (!inWorld(save, data)) return null
  const held = heldWorld(save)
  return (held?.regionId === regionOf(save) ? worldById(data, held.id) : null) ?? worldOfRegion(data, regionOf(save))
}

/** The region "Back" goes to: where the player came from, else the latest real region they hold. */
function backRegion(save: SaveData, data: GameData, held: WorldSave): RegionId | null {
  if (save.parked?.[held.from] && held.from !== held.regionId) return held.from
  const real = realRegions(data).map((r) => r.id)
  const parked = Object.keys(save.parked ?? {}).filter((id) => id !== held.regionId && !isWorldRegion(data, id))
  return [...real].reverse().find((id) => parked.includes(id)) ?? (parked.includes(KANTO) ? KANTO : (parked[0] ?? null))
}

/** Areas cleared in the world this save holds, out of its chain (Home's square: "Areas 3/8"). */
export function worldProgress(save: SaveData, data: GameData, world: SmallWorld): { cleared: number; total: number } {
  const chain = regionAreas(data, world.regionId)
  const held = heldWorld(save)
  const progress =
    held?.id !== world.id ? {} : regionOf(save) === world.regionId ? save.areaProgress : (save.parked?.[world.regionId]?.areaProgress ?? {})
  return { cleared: chain.filter((a) => progress[a.id]?.cleared).length, total: chain.length }
}

// ------------------------------------------------------------------ in and out

/** Why entering is refused, or null when the player can go in. */
export type EnterBlock = 'closed' | 'extreme' | 'region' | 'starter'

/** The player has been in this world before: its block waits, parked. */
export const worldStarted = (save: SaveData, world: SmallWorld): boolean =>
  heldWorld(save)?.id === world.id && (regionOf(save) === world.regionId || !!save.parked?.[world.regionId])

/**
 * Into the world. The first time it's a fresh start on one of its partners (`starter`, at the region's starter
 * level): its block is made the way a new region's is (₽0, the new-game bag, upgrade tracks at the start). After that it
 * switches to the parked block. The region being left is parked as it is, and remembered as the way back.
 */
export function enterWorld(
  save: SaveData,
  data: GameData,
  world: SmallWorld,
  starter: number | null,
  now: number,
  newId: () => string,
): SaveData | null {
  if (isExtreme(save)) return null
  const region = getRegion(data, world.regionId)
  if (!region) return null
  if (regionOf(save) === world.regionId) return save
  const held = heldWorld(save)
  if (held && worldStarted(save, world)) {
    const from = regionOf(save)
    const next = switchRegion(save, world.regionId)
    return next === save ? null : { ...next, events: { ...next.events, world: { ...held, from } } }
  }
  if (starter == null || !world.starters.includes(starter) || !data.species[starter]) return null
  // Another world's block (one that ended) never carries over: it closes first.
  const base = held ? closeWorld(save, data) : save
  if (heldWorld(base)) return null
  const from = regionOf(base)
  const block = newRegionBlock(region, starter, data, now, newId, createInstance)
  const next = startRegion(base, region, block)
  const seen = next.events?.worldSeen ?? []
  return {
    ...next,
    events: {
      ...next.events,
      world: { id: world.id, regionId: world.regionId, from, partner: starter },
      worldSeen: seen.includes(world.id) ? seen : [...seen, world.id].slice(-20),
    },
  }
}

/** Back to the region the player came from; the world's block is parked as it is, to come back to. */
export function leaveWorld(save: SaveData, data: GameData): SaveData | null {
  const held = heldWorld(save)
  if (!held || regionOf(save) !== held.regionId) return null
  const to = backRegion(save, data, held)
  if (!to) return null
  const next = switchRegion(save, to)
  return next === save ? null : next
}

/**
 * The world this save holds is over: its end has passed (or the admin ended it now), or it's gone from the admin's
 * list — which only the live content can say (`trustList`): the game's own bundle never has the admin's worlds.
 */
export function worldOver(save: SaveData, data: GameData, now: number | null, trustList: boolean): boolean {
  const held = heldWorld(save)
  if (!held) return false
  const w = worldById(data, held.id)
  if (!w) return trustList
  const end = at(w.end)
  return now != null && Number.isFinite(end) && now >= end
}

/**
 * The world closes for this player: anyone inside goes back where they came from, and its block — Box, bag, ₽, areas,
 * Pokédex — is deleted. `events.world` stays, closed, until the closing pop-up has been shown. Unchanged when the save
 * holds no world, or there is nowhere to go back to.
 */
export function closeWorld(save: SaveData, data: GameData): SaveData {
  const held = heldWorld(save)
  if (!held) return save
  let next = save
  if (regionOf(next) === held.regionId) {
    const to = backRegion(next, data, held)
    if (!to) return save
    next = switchRegion(next, to)
    if (next === save) return save
  }
  const parked = { ...next.parked }
  delete parked[held.regionId]
  return { ...next, parked, events: { ...next.events, world: { ...held, closed: true } } }
}

// ------------------------------------------------------------------ pop-ups

/** Its opening pop-up is due: open for this player, not shown yet. */
export const worldPopupDue = (save: SaveData, world: SmallWorld | null): boolean =>
  !!world && !(save.events?.worldSeen ?? []).includes(world.id)

/** The opening pop-up was shown (the last 20 ids are kept). */
export function markWorldSeen(save: SaveData, world: SmallWorld): SaveData {
  const seen = save.events?.worldSeen ?? []
  if (seen.includes(world.id)) return save
  return { ...save, events: { ...save.events, worldSeen: [...seen, world.id].slice(-20) } }
}

/** A closing pop-up: the world (null when the admin has deleted it since), and whether the player played it. */
export interface WorldBye {
  id: string
  world: SmallWorld | null
  entered: boolean
  caught: boolean
  partner: number | null
}

/**
 * The closing pop-up that's due: the world this save held has closed, or — for a player who saw it open but never went
 * in — the latest world has ended. Once each.
 */
export function worldByeDue(save: SaveData, data: GameData, now: number | null): WorldBye | null {
  const bye = new Set(save.events?.worldBye ?? [])
  const w = save.events?.world
  if (w?.closed && !bye.has(w.id))
    return { id: w.id, world: worldById(data, w.id), entered: true, caught: !!w.caught, partner: w.partner }
  if (now == null || heldWorld(save)) return null
  const seen = new Set(save.events?.worldSeen ?? [])
  const last = smallWorlds(data)
    .filter((x) => worldState(x, now) === 'ended' && at(x.end) <= now)
    .sort((a, b) => at(b.end) - at(a.end))[0]
  if (!last || !seen.has(last.id) || bye.has(last.id)) return null
  return { id: last.id, world: last, entered: false, caught: false, partner: null }
}

/** The closing pop-up was shown: the closed world's record goes (the last 20 ids are kept). */
export function markWorldBye(save: SaveData, id: string): SaveData {
  const bye = save.events?.worldBye ?? []
  const { world, ...events } = save.events ?? {}
  return {
    ...save,
    events: {
      ...(world?.closed && world.id === id ? events : save.events),
      worldBye: bye.includes(id) ? bye : [...bye, id].slice(-20),
    },
  }
}

// ------------------------------------------------------------------ its rules

/** When this area of a small world opens (ms, UTC), if it waits for a date. */
export function areaOpensAt(data: GameData, areaId: string): number | null {
  const area = data.areas.find((a) => a.id === areaId)
  const iso = worldOfArea(data, area)?.opens[areaId]
  const t = iso ? at(iso) : NaN
  return Number.isFinite(t) ? t : null
}

/**
 * The area's date has come, on the server's clock (no date: always; time unknown: not yet). On top of the usual rule
 * (`isAreaUnlocked`: the one before cleared), which stays clock-free.
 */
export function areaOpenAt(data: GameData, areaId: string, now: number | null): boolean {
  const t = areaOpensAt(data, areaId)
  return t == null || (now != null && now >= t)
}

/**
 * A fight in a small world's area: no upgrades on either side — each Pokémon's dice and combos at its own level ÷ 10
 * (`attackerLevels`) — and the world's boosters, both sides'. Null outside a world.
 */
export function worldBattleLevels(data: GameData, area: { regionId?: RegionId } | undefined): UpgradeLevels | null {
  const w = worldOfArea(data, area)
  if (!w) return null
  const typeBoost = Object.fromEntries(w.boosters.filter((b) => b.multiplier > 0 && b.multiplier !== 1).map((b) => [b.type, b.multiplier]))
  return { comboLevels: {}, dieLevels: {}, byLevel: true, ...(Object.keys(typeBoost).length > 0 && { typeBoost }) }
}

// ------------------------------------------------------------------ its Mart

export interface WorldShopRow {
  item: ItemDef
  /** Its price in the world's ₽: the admin's, never below what the Mart pays back for it. */
  price: number
  limit: number | null
  bought: number
  /** Left for this player; null = no limit. */
  left: number | null
}

/** The world's Mart: the admin's list and nothing else, while the player is in it. */
export function worldShopRows(save: SaveData, data: GameData): WorldShopRow[] {
  const world = currentWorld(save, data)
  if (!world) return []
  const bought = heldWorld(save)?.id === world.id ? (heldWorld(save)?.bought ?? {}) : {}
  return world.shop.flatMap((row) => {
    const item = data.items[row.key]
    if (!item) return []
    const limit = row.limit == null ? null : Math.max(0, Math.floor(row.limit))
    const n = bought[row.key] ?? 0
    return [{ item, price: Math.max(1, Math.round(row.price), sellPrice(item)), limit, bought: n, left: limit == null ? null : Math.max(0, limit - n) }]
  })
}

/** Buys from the world's Mart, with the world's ₽, within the row's limit. Null when it can't. */
export function buyWorldItem(
  save: SaveData,
  data: GameData,
  key: string,
  qty: number,
  now: number,
  newId: () => string = () => `fossil-${now}`,
): SaveData | null {
  const held = heldWorld(save)
  const row = worldShopRows(save, data).find((r) => r.item.key === key)
  if (!held || !row || qty <= 0 || !Number.isInteger(qty)) return null
  if (row.left != null && qty > row.left) return null
  const cost = row.price * qty
  if (save.gold < cost) return null
  let next: SaveData = {
    ...save,
    gold: save.gold - cost,
    events: { ...save.events, world: { ...held, bought: { ...held.bought, [key]: row.bought + qty } } },
  }
  if (row.item.effect.kind === 'fossil') {
    for (let i = 0; i < qty; i++) next = addFossil(next, row.item, data, now, newId())
    return next
  }
  return { ...next, inventory: { ...next.inventory, [key]: (next.inventory[key] ?? 0) + qty } }
}

// ------------------------------------------------------------------ the shiny mythical

/** The region a world's mythical goes home to: its generation's (Mew → Kanto, Celebi → Johto, Victini → Unova…). */
export const mythicalHome = (data: GameData, dex: number): RegionId => regionOfSpecies(data, dex) ?? KANTO

/**
 * A catch in a small world: when it's the world's shiny mythical, it leaves the world at once for its home region's
 * Box (in the real games' region), or waits for that region to be started (`events.worldPending`). The world's
 * Pokédex notes it, so its lair closes and it stops coming back. Null for any other catch (it stays in the world).
 */
export function catchWorldMythical(
  save: SaveData,
  data: GameData,
  areaId: string,
  caught: { dex: number; level: number },
  now: number,
  newId: () => string,
): { save: SaveData; events: RunEvent[] } | null {
  const world = currentWorld(save, data)
  const held = heldWorld(save)
  if (!world || !held || held.id !== world.id || world.mythical.areaId !== areaId || world.mythical.dex !== caught.dex) return null
  const dex = caught.dex
  const noted: SaveData = {
    ...save,
    pokedex: save.pokedex.includes(dex) ? save.pokedex : [...save.pokedex, dex],
    events: { ...save.events, world: { ...held, caught: true } },
  }
  const inst = createInstance(dex, caught.level, data, newId(), now)
  inst.shiny = true
  const home = mythicalHome(data, dex)
  const sent = home === world.regionId ? null : addToRegion(noted, data, home, inst)
  if (sent) return { save: sent.save, events: [{ kind: 'world_mythical', dex, level: caught.level, region: home, waiting: false }] }
  const pending: WorldCatch = { dex, level: caught.level, shiny: true, worldId: world.id }
  return {
    save: { ...noted, events: { ...noted.events, worldPending: [...(noted.events?.worldPending ?? []), pending] } },
    events: [{ kind: 'world_mythical', dex, level: caught.level, region: home, waiting: true }],
  }
}

/** Mythicals waiting for their home region: each joins that region's Box once it's started. `released` names them. */
export function releaseWorldPending(
  save: SaveData,
  data: GameData,
  now: number,
  newId: () => string,
): { save: SaveData; released: (WorldCatch & { region: RegionId })[] } {
  const waiting = save.events?.worldPending
  if (!waiting?.length) return { save, released: [] }
  let next = save
  const released: (WorldCatch & { region: RegionId })[] = []
  const still: WorldCatch[] = []
  for (const p of waiting) {
    const home = mythicalHome(data, p.dex)
    if (!data.species[p.dex] || isWorldRegion(data, home)) {
      still.push(p)
      continue
    }
    const inst = createInstance(p.dex, p.level, data, newId(), now)
    if (p.shiny) inst.shiny = true
    const res = addToRegion(next, data, home, inst)
    if (!res) {
      still.push(p)
      continue
    }
    next = res.save
    released.push({ ...p, region: home })
  }
  if (!released.length) return { save, released }
  const { worldPending: _all, ...events } = next.events ?? {}
  return { save: { ...next, events: still.length ? { ...events, worldPending: still } : events }, released }
}

// ------------------------------------------------------------------ the admin

/** The world of the list that overlaps this one in time, if any: one runs at a time. */
export function worldOverlap(list: readonly SmallWorld[], w: SmallWorld): SmallWorld | null {
  const s = at(w.start)
  const end = at(w.end)
  return list.find((o) => o.id !== w.id && at(o.start) < end && s < at(o.end)) ?? null
}

/** What stops the admin from saving a world (empty = fine). */
export function worldProblems(list: readonly SmallWorld[], w: SmallWorld, data: GameData): string[] {
  const out: string[] = []
  if (!(at(w.end) > at(w.start))) out.push('It ends before it starts.')
  const clash = worldOverlap(list, w)
  if (clash) out.push(`It overlaps another small world (${clash.start.slice(0, 16)} → ${clash.end.slice(0, 16)} UTC): one at a time.`)
  const region = getRegion(data, w.regionId)
  if (!region) out.push('No region: make the world’s region first (Config → Regions).')
  else {
    if (list.some((o) => o.id !== w.id && o.regionId === w.regionId))
      out.push('Another world of the list uses this region: give each world its own (or delete the old world).')
    if (region.id === KANTO) out.push('Kanto can’t be a small world.')
    const real = realRegions(data).filter((r) => r.id !== region.id)
    const [lo, hi] = region.dexRange
    const clashing = real.find((r) => lo <= r.dexRange[1] && r.dexRange[0] <= hi && hi >= 1)
    if (clashing) out.push(`The region’s Pokédex range overlaps ${clashing.name}’s: give it one no real region uses (e.g. 0–0).`)
    if (real.some((r) => r.nextRegion === region.id)) out.push('A real region’s league leads to this region: a world is in no chain.')
    if (!regionAreas(data, region.id).length) out.push('The world’s region has no area yet (Admin → Areas).')
  }
  if (w.starters.length !== 3 || new Set(w.starters).size !== 3) out.push('Pick three different starters.')
  for (const d of w.starters) if (!data.species[d]) out.push(`Unknown starter: #${d}.`)
  if (!data.species[w.mythical.dex]) out.push('Pick the shiny mythical.')
  if (!(w.mythical.level >= 1 && w.mythical.level <= data.config.maxLevel)) out.push(`The mythical’s level must be 1–${data.config.maxLevel}.`)
  const area = data.areas.find((a) => a.id === w.mythical.areaId)
  if (!area) out.push('Pick the area the mythical waits in.')
  else if ((area.regionId ?? KANTO) !== w.regionId) out.push('The mythical’s area isn’t one of the world’s.')
  if (!(w.xpMultiplier > 0)) out.push('The XP multiplier must be above 0.')
  if (new Set(w.boosters.map((b) => b.type)).size !== w.boosters.length) out.push('A booster type is listed twice.')
  for (const b of w.boosters) if (!(b.multiplier > 0)) out.push(`The ${b.type} booster’s multiplier must be above 0.`)
  for (const r of w.shop) {
    if (!data.items[r.key]) out.push(`Unknown item: ${r.key}.`)
    if (!(r.price >= 1)) out.push(`${data.items[r.key]?.name ?? r.key}: the price must be ₽1 or more.`)
  }
  for (const [areaId, iso] of Object.entries(w.opens)) {
    const a = data.areas.find((x) => x.id === areaId)
    if (!a || (a.regionId ?? KANTO) !== w.regionId) out.push('An opening date is set on an area that isn’t the world’s.')
    if (!Number.isFinite(at(iso))) out.push(`${a?.name ?? areaId}: its opening date isn’t a date.`)
  }
  return out
}
