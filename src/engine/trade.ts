// Trades (docs/23-TRADING-PLAN.md): players trade Pokémon through listings, like the games' GTS. The server holds the
// listings and decides who got there first; each player's game applies its own half of a trade, here. Everything a
// trade decides — the level a Pokémon arrives at, where it lands, how it's kept, a trade evolution — is worked out by
// these functions; the screens only show their results.
import { isLegendary } from './breeding'
import { everyRegionBox, type BoxedMon } from './daycare'
import { eventOpenTo } from './events'
import { isExtreme } from './extreme'
import { isReviving } from './fossils'
import { badgesHeld } from './liveEvents'
import { cleanNickname } from './nickname'
import { createInstance, evolve, instanceMaxHp, isTradeEvolution, tradeEvolutionOf } from './progression'
import {
  getRegion,
  inWorldRegion,
  isWorldRegion,
  KANTO,
  regionOf,
  regionOfSpecies,
  speciesAllowedIn,
  unlockedRegions,
  worldRegionOf,
} from './regions'
import type {
  GameData,
  PokemonInstance,
  RegionId,
  RegionSave,
  SaveData,
  TradeConfig,
  TradeLogEntry,
  TradeOut,
  TradeOutcome,
  TradeVisibility,
  TradeWant,
  TradesSave,
} from './types'

export const tradeCfg = (data: GameData): TradeConfig => data.config.trade

/** The admin's switch (docs/15 §20): on for everyone, or for the admin only. */
export const tradesOn = (data: GameData): boolean => eventOpenTo(data.config.trade?.access, data)

/**
 * Why this save can't trade at all: the switch, an Extreme save (a solo challenge), playing in a small world (no trade
 * reaches one, docs/21), too few badges.
 */
export type TradeClosed = 'off' | 'extreme' | 'world' | 'badges'

export function tradeClosed(save: SaveData, data: GameData): TradeClosed | null {
  if (!tradesOn(data)) return 'off'
  if (isExtreme(save)) return 'extreme'
  if (inWorldRegion(save, data)) return 'world'
  if (badgesHeld(save, data) < tradeCfg(data).minBadges) return 'badges'
  return null
}

export const tradesOf = (save: SaveData): TradesSave => save.trades ?? { out: [], done: [] }

// ---------------------------------------------------------------- the species' minimum (§1.3)

/** Why a species can't be lower: its pre-evolution's evolution level, a fixed-level wild area, its pre-evolution's minimum. */
export type MinReason =
  | { kind: 'base' }
  | { kind: 'evolves'; from: number; level: number }
  | { kind: 'wild'; areaId: string; level: number }
  | { kind: 'via'; from: number; how: 'item' | 'trade' }

export interface SpeciesMin {
  level: number
  reason: MinReason
}

interface PreEvo {
  from: number
  /** The level it evolves at, or null for an item or a trade. */
  level: number | null
  trade: boolean
}

interface MinIndex {
  pre: Map<number, PreEvo[]>
  wild: Map<number, { level: number; areaId: string }>
  memo: Map<number, SpeciesMin>
}

// Built once per data: the admin's edits make new data, so they flow in.
const indexes = new WeakMap<GameData, MinIndex>()

function minIndex(data: GameData): MinIndex {
  let idx = indexes.get(data)
  if (idx) return idx
  const pre = new Map<number, PreEvo[]>()
  for (const s of data.speciesList) {
    for (const e of s.evolutions) {
      if (!data.species[e.toDex]) continue
      const trade = isTradeEvolution(data, s.dex, e.toDex)
      const list = pre.get(e.toDex) ?? []
      list.push({ from: s.dex, level: trade ? null : (e.level ?? null), trade })
      pre.set(e.toDex, list)
    }
  }
  // The lowest level each species is met wild where levels don't follow the team.
  const wild = new Map<number, { level: number; areaId: string }>()
  for (const a of data.areas) {
    if (a.scalesToTeam) continue
    for (const w of a.wildPool) {
      if (w.weight <= 0) continue
      const cur = wild.get(w.dex)
      if (!cur || w.minLevel < cur.level) wild.set(w.dex, { level: w.minLevel, areaId: a.id })
    }
  }
  idx = { pre, wild, memo: new Map() }
  indexes.set(data, idx)
  return idx
}

/**
 * The lowest level the game ever gives a species: its evolution level; lower if it's met wild lower in a fixed-level
 * area; a species evolved by an item or a trade takes its pre-evolution's minimum; one with no pre-evolution starts at
 * Lv.1. Worked out from the content, never stored.
 */
export function speciesMinLevel(data: GameData, dex: number): SpeciesMin {
  const idx = minIndex(data)
  return minOf(idx, data, dex, new Set())
}

function minOf(idx: MinIndex, data: GameData, dex: number, seen: Set<number>): SpeciesMin {
  const kept = idx.memo.get(dex)
  if (kept) return kept
  if (seen.has(dex)) return { level: 1, reason: { kind: 'base' } }
  seen.add(dex)
  let best: SpeciesMin = { level: 1, reason: { kind: 'base' } }
  const pres = idx.pre.get(dex) ?? []
  if (pres.length) {
    best = { level: Infinity, reason: { kind: 'base' } }
    for (const p of pres) {
      const m: SpeciesMin =
        p.level != null
          ? { level: p.level, reason: { kind: 'evolves', from: p.from, level: p.level } }
          : {
              level: minOf(idx, data, p.from, seen).level,
              reason: { kind: 'via', from: p.from, how: p.trade ? 'trade' : 'item' },
            }
      if (m.level < best.level) best = m
    }
  }
  const w = idx.wild.get(dex)
  if (w && w.level < best.level)
    best = { level: w.level, reason: { kind: 'wild', areaId: w.areaId, level: w.level } }
  const out = { level: Math.max(1, Math.min(data.config.maxLevel, best.level)), reason: best.reason }
  idx.memo.set(dex, out)
  return out
}

export interface Arrival {
  level: number
  min: SpeciesMin
  /** Raised to the species' minimum. */
  raised: boolean
  /** The Pokémon given was above the cap. */
  capped: boolean
}

/** The level a traded Pokémon arrives at: the level of the one given, at most the cap, raised to the species' minimum. */
export function arrivalLevel(data: GameData, dex: number, givenLevel: number): Arrival {
  const min = speciesMinLevel(data, dex)
  const cap = tradeCfg(data).levelCap
  const capped = Math.min(givenLevel, cap)
  return { level: Math.max(capped, min.level), min, raised: min.level > capped, capped: givenLevel > cap }
}

// ---------------------------------------------------------------- what can be traded

/** Where a traded Pokémon lands: the region of its generation (a regional form: its form's). */
export const homeRegionOf = (data: GameData, dex: number): RegionId | null => regionOfSpecies(data, dex)

/** Legendaries, mythicals and the admin's list (the Ultra Beasts) are never traded; nor are Mega, G-Max or battle forms. */
export function untradable(data: GameData, dex: number): 'legendary' | 'excluded' | null {
  if (isLegendary(data, dex)) return 'legendary'
  const form = data.species[dex]?.form
  if (form && form.kind !== 'regional') return 'excluded'
  if (tradeCfg(data).exclude.includes(dex)) return 'excluded'
  return null
}

/** A small world's region (docs/21): nothing in it is ever listed, given or received. */
const isWorld = (save: SaveData, data: GameData, id: RegionId): boolean =>
  isWorldRegion(data, id) || worldRegionOf(save) === id

/**
 * The regions started (live or parked, still on), small worlds left out: the ones whose species can be asked for and
 * received.
 */
export const tradeRegions = (save: SaveData, data: GameData): RegionId[] =>
  unlockedRegions(save, data)
    .map((r) => r.id)
    .filter((id) => !isWorld(save, data, id))

export type ListBlock = 'legendary' | 'excluded' | 'reviving' | 'last' | 'region'

/** The Box a Pokémon of `boxed` sits in. */
const blockOfBoxed = (save: SaveData, at: BoxedMon): Pick<RegionSave, 'box' | 'team'> =>
  at.live ? save : save.parked![at.region]!

/**
 * Why this Pokémon can't be listed or given, or null: legendary, on the admin's list, a fossil reviving, its region's
 * last Pokémon, or one whose home region the other trainer hasn't started (`regions`, for the taker's picker).
 */
export function tradeBlocked(
  save: SaveData,
  data: GameData,
  at: BoxedMon,
  regions?: RegionId[],
): ListBlock | null {
  const no = untradable(data, at.inst.dex)
  if (no) return no
  if (isReviving(at.inst)) return 'reviving'
  if (blockOfBoxed(save, at).box.filter((p) => !isReviving(p) && p.id !== at.inst.id).length < 1)
    return 'last'
  if (regions) {
    const home = homeRegionOf(data, at.inst.dex)
    if (!home || !regions.includes(home)) return 'region'
  }
  return null
}

/**
 * Every Pokémon that could go in a trade: every region's Box and team, a small world's left out (the Day Care's wait
 * at the Day Care).
 */
export const tradeChoices = (save: SaveData, data: GameData): BoxedMon[] =>
  everyRegionBox(save, data).filter((m) => !isWorld(save, data, m.region))

/**
 * Every species that can be asked for: those of the regions started (a regional form with its region), legendaries,
 * mythicals, the admin's list and Mega, G-Max and battle forms left out.
 */
export function wantable(save: SaveData, data: GameData): number[] {
  const regions = new Set(tradeRegions(save, data))
  return data.speciesList
    .filter((s) => {
      if (untradable(data, s.dex)) return false
      const home = homeRegionOf(data, s.dex)
      return !!home && regions.has(home)
    })
    .map((s) => s.dex)
    .sort((a, b) => a - b)
}

// ---------------------------------------------------------------- what you own, as a listing remembers it

/**
 * What a poster owns, kept with a listing: the species in the Box each would land in (its home region's), the ones
 * owned shiny, and the regions started. "Any I don't own" is checked against it when someone takes the listing (the
 * server checks it too, so it decodes the same bitset), and the taker's picker only offers what the poster can receive.
 * `has` is a base64 bitset of the dex numbers under 2048 (bit n = byte n >> 3, bit n & 7); regional forms go in `forms`.
 */
export interface TradeSnapshot {
  has: string
  forms: number[]
  shiny: number[]
  regions: RegionId[]
}

const BITSET_MAX = 2048

/** Dex numbers in a Box that is their home region's, and those of them owned shiny. */
export function ownedForTrades(save: SaveData, data: GameData): { has: Set<number>; shiny: Set<number> } {
  const has = new Set<number>()
  const shiny = new Set<number>()
  for (const m of everyRegionBox(save, data)) {
    if (isReviving(m.inst) || homeRegionOf(data, m.inst.dex) !== m.region) continue
    has.add(m.inst.dex)
    if (m.inst.shiny) shiny.add(m.inst.dex)
  }
  return { has, shiny }
}

export function tradeSnapshot(save: SaveData, data: GameData): TradeSnapshot {
  const { has, shiny } = ownedForTrades(save, data)
  return { ...encodeDexSet(has), shiny: [...shiny].sort((a, b) => a - b), regions: tradeRegions(save, data) }
}

/** A set of dex numbers as a snapshot keeps it: the bitset under 2048, the rest listed. */
export function encodeDexSet(dex: Iterable<number>): Pick<TradeSnapshot, 'has' | 'forms'> {
  const bytes = new Uint8Array(BITSET_MAX / 8)
  const forms: number[] = []
  for (const d of dex) {
    if (d < BITSET_MAX) bytes[d >> 3]! |= 1 << (d & 7)
    else forms.push(d)
  }
  return { has: toBase64(bytes), forms: forms.sort((a, b) => a - b) }
}

/** Does the snapshot's owner have this species in the Box it would land in? */
export function snapshotHas(snap: Pick<TradeSnapshot, 'has' | 'forms'>, dex: number): boolean {
  if (dex >= BITSET_MAX) return snap.forms.includes(dex)
  const bytes = fromBase64(snap.has)
  return ((bytes[dex >> 3] ?? 0) >> (dex & 7)) & 1 ? true : false
}

/**
 * Does this Pokémon answer the want? A species: that one, shiny or not. Any I don't own: one the poster doesn't have in
 * the Box it would land in, or a shiny when they have no shiny of it. Anything: anything.
 */
export function wantMatches(
  want: TradeWant,
  mon: { dex: number; shiny?: boolean },
  poster: TradeSnapshot,
): boolean {
  if (want.kind === 'species') return mon.dex === want.dex
  if (want.kind === 'notOwned')
    return !snapshotHas(poster, mon.dex) || (!!mon.shiny && !poster.shiny.includes(mon.dex))
  return true
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      (B64.indexOf(clean[i + 2] ?? 'A') << 6) |
      B64.indexOf(clean[i + 3] ?? 'A')
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}

// ---------------------------------------------------------------- moving Pokémon

/** Reads or writes one region's Box and team, the live one at the top level, a parked one in `save.parked`. */
function withBlock(
  save: SaveData,
  region: RegionId,
  fn: (b: Pick<RegionSave, 'box' | 'team' | 'pokedex'>) => Pick<RegionSave, 'box' | 'team' | 'pokedex'>,
): SaveData {
  if (region === regionOf(save) || !save.parked?.[region]) {
    const next = fn({ box: save.box, team: save.team, pokedex: save.pokedex })
    return { ...save, ...next }
  }
  const block = save.parked[region]!
  return { ...save, parked: { ...save.parked, [region]: { ...block, ...fn(block) } } }
}

/** The region that holds this instance, live or parked, or null. */
function regionHolding(save: SaveData, data: GameData, instId: string): RegionId | null {
  return everyRegionBox(save, data).find((m) => m.inst.id === instId)?.region ?? null
}

/**
 * A Pokémon leaves for good (given in a trade) or for the trade board (listed): out of its region's Box and team. If it
 * was the whole team, the Box promotes the next one, as when a Pokémon is sent on (engine/regions.ts).
 */
export function takeOutOfBox(save: SaveData, data: GameData, instId: string): SaveData | null {
  const region = regionHolding(save, data, instId)
  if (!region) return null
  return withBlock(save, region, (b) => {
    const box = b.box.filter((p) => p.id !== instId)
    let team = b.team.filter((id) => id !== instId)
    if (!team.length) {
      const heir = box.find((p) => !isReviving(p))
      if (heir) team = [heir.id]
    }
    return { ...b, box, team }
  })
}

/** A listing posted: its Pokémon leaves its Box and waits in `trades.out`, frozen, until the trade is done or ends. */
export function listOut(
  save: SaveData,
  data: GameData,
  instId: string,
  listing: { id: string; code: string; endsAt: number; want: TradeWant; visibility: TradeVisibility },
  now: number,
): SaveData | null {
  const at = everyRegionBox(save, data).find((m) => m.inst.id === instId)
  if (!at) return null
  const taken = takeOutOfBox(save, data, instId)
  if (!taken) return null
  const t = tradesOf(taken)
  const entry: TradeOut = {
    listing: listing.id,
    code: listing.code,
    region: at.region,
    mon: at.inst,
    at: now,
    endsAt: listing.endsAt,
    want: listing.want,
    visibility: listing.visibility,
  }
  return { ...taken, trades: { ...t, out: [...t.out.filter((o) => o.listing !== listing.id), entry] } }
}

/**
 * The Box a Pokémon for `region` lands in: that region's when it's started; else the live one; never a small world's
 * (it closes with everything in it): then a started region, Kanto first.
 */
function landing(save: SaveData, data: GameData, region: RegionId): RegionId {
  const started = (id: RegionId) => id === regionOf(save) || !!save.parked?.[id]
  if (started(region) && !isWorld(save, data, region)) return region
  if (!isWorld(save, data, regionOf(save))) return regionOf(save)
  const real = [KANTO, ...Object.keys(save.parked ?? {})].find(
    (id) => started(id) && !isWorld(save, data, id),
  )
  return real ?? regionOf(save)
}

export interface Placed {
  save: SaveData
  outcome: TradeOutcome
  /** The instance it is now (a new one, or the copy it replaced); null when it merged. */
  instId: string | null
  region: RegionId
}

/**
 * The catch rule (§1.4), for a Pokémon arriving in a region's Box: a shiny is always its own Pokémon; a plain one with
 * no plain copy there joins (and the team, if it has room); a stronger one than your weakest plain copy replaces it in
 * place (its team slot keeps it); as strong or weaker, it merges into yours, which stays as it is. A region not started
 * (switched off since) gives it to the live one.
 */
export function placeInBox(save: SaveData, data: GameData, region: RegionId, inst: PokemonInstance): Placed {
  const here = landing(save, data, region)
  const b = here === regionOf(save) ? save : save.parked![here]!
  const withDex = (dex: readonly number[], d: number) => (dex.includes(d) ? [...dex] : [...dex, d])
  const plain = b.box.filter((p) => p.dex === inst.dex && !p.shiny && !isReviving(p))
  if (inst.shiny || !plain.length) {
    const join = b.team.length < data.config.maxTeamSize
    const next = withBlock(save, here, (x) => ({
      box: [...x.box, inst],
      team: join ? [...x.team, inst.id] : x.team,
      pokedex: withDex(x.pokedex, inst.dex),
    }))
    return { save: next, outcome: inst.shiny ? 'shiny' : 'new', instId: inst.id, region: here }
  }
  const weakest = [...plain].sort((a, c) => a.level - c.level)[0]!
  if (weakest.level >= inst.level) return { save, outcome: 'merged', instId: null, region: here }
  // The one arriving is the one you now have: its nickname comes with it; without one, yours stays.
  const upgraded: PokemonInstance = {
    ...weakest,
    level: inst.level,
    xp: 0,
    caughtAt: inst.caughtAt,
    ...(inst.nickname && { nickname: inst.nickname }),
  }
  upgraded.currentHp = instanceMaxHp(upgraded, data)
  const next = withBlock(save, here, (x) => ({
    ...x,
    box: x.box.map((p) => (p.id === weakest.id ? upgraded : p)),
  }))
  return { save: next, outcome: 'replaced', instId: weakest.id, region: here }
}

/** A listing that ended without a trade (cancelled, run out, removed by the admin): its Pokémon goes back to its Box. */
export function listBack(save: SaveData, data: GameData, listingId: string): Placed | null {
  const t = tradesOf(save)
  const entry = t.out.find((o) => o.listing === listingId)
  if (!entry) return null
  const without: SaveData = { ...save, trades: { ...t, out: t.out.filter((o) => o.listing !== listingId) } }
  // An older copy of the save still had it in its Box: nothing to give back.
  if (everyRegionBox(without, data).some((m) => m.inst.id === entry.mon.id)) {
    return { save: without, outcome: 'merged', instId: entry.mon.id, region: entry.region }
  }
  return placeInBox(without, data, entry.region, entry.mon)
}

export interface Received {
  save: SaveData
  outcome: TradeOutcome
  /** The species that arrived, and the level it arrived at (§1.3). */
  dex: number
  arrival: Arrival
  /** A trade evolution (§1.5): the species it became on arrival. */
  evolvedTo: number | null
  region: RegionId
  /** The instance it is now (a new one, or the copy it replaced); null when it merged into yours. */
  instId: string | null
  /** It (or what it evolved into) wasn't in that region's Pokédex. */
  isNew: boolean
}

/**
 * A Pokémon arrives in a trade: a fresh instance at the arrival level (XP 0, full HP) with the nickname its trainer
 * gave it, evolved at once when it's a trade evolution its home region allows, then placed in its home region's Box by
 * the catch rule. Both species go in that region's Pokédex.
 */
export function receiveTrade(
  save: SaveData,
  data: GameData,
  mon: { dex: number; shiny?: boolean; nickname?: string },
  givenLevel: number,
  now: number,
  newId: () => string,
): Received {
  const arrival = arrivalLevel(data, mon.dex, givenLevel)
  const region = homeRegionOf(data, mon.dex) ?? regionOf(save)
  let inst = createInstance(mon.dex, arrival.level, data, newId(), now)
  if (mon.shiny) inst.shiny = true
  const nickname = cleanNickname(mon.nickname)
  if (nickname) inst.nickname = nickname
  const to = tradeEvolutionOf(data, mon.dex)
  const evolvedTo = to != null && speciesAllowedIn(data, region)(to) ? to : null
  if (evolvedTo != null) inst = evolve(inst, evolvedTo, data)
  inst.currentHp = instanceMaxHp(inst, data)
  const dexBefore = pokedexOf(save, region)
  const isNew = !dexBefore.includes(inst.dex) || (evolvedTo != null && !dexBefore.includes(mon.dex))
  let placed = placeInBox(save, data, region, inst)
  // The species that arrived counts too when it evolved on the way in.
  if (evolvedTo != null)
    placed = {
      ...placed,
      save: withBlock(placed.save, placed.region, (b) => ({
        ...b,
        pokedex: b.pokedex.includes(mon.dex) ? b.pokedex : [...b.pokedex, mon.dex],
      })),
    }
  return {
    save: placed.save,
    outcome: placed.outcome,
    dex: mon.dex,
    arrival,
    evolvedTo,
    region: placed.region,
    instId: placed.instId,
    isNew,
  }
}

function pokedexOf(save: SaveData, region: RegionId): number[] {
  return region === regionOf(save) ? save.pokedex : (save.parked?.[region]?.pokedex ?? save.pokedex)
}

// ---------------------------------------------------------------- a trade, applied once

const DONE_KEPT = 50
const LOG_KEPT = 20

function markDone(save: SaveData, id: string, log?: TradeLogEntry, unseen = false): SaveData {
  const t = tradesOf(save)
  const nextLog = log ? [log, ...(t.log ?? []).filter((l) => l.id !== id)].slice(0, LOG_KEPT) : t.log
  const ids = unseen ? [id, ...(t.unseen ?? []).filter((u) => u !== id)] : t.unseen
  return {
    ...save,
    trades: {
      ...t,
      done: [id, ...t.done.filter((d) => d !== id)].slice(0, DONE_KEPT),
      ...(log ? { log: nextLog } : {}),
      // An unseen trade that has left the log has no scene left to play: it would keep the gold dot up for good.
      ...(ids ? { unseen: ids.filter((u) => nextLog?.some((l) => l.id === u)) } : {}),
    },
  }
}

export const tradeApplied = (save: SaveData, id: string): boolean => tradesOf(save).done.includes(id)

/** What the Done list and the scene keep of a Pokémon beyond its species and level: shiny, and its nickname. */
function extras(m: PokemonInstance): { shiny?: true; nickname?: string } {
  const nickname = cleanNickname(m.nickname)
  return { ...(m.shiny && { shiny: true }), ...(nickname && { nickname }) }
}

/** What the server says a taken trade was: the listed Pokémon, the one given for it, who took it. */
export interface TakenTrade {
  id: string
  /** The listed Pokémon, as listed. */
  listed: PokemonInstance
  /** The Pokémon given for it, as it was in the taker's cloud save. */
  given: PokemonInstance
  /** The other trainer's name. */
  with: string
}

export interface TradeResult {
  save: SaveData
  received: Received | null
  /** Already applied before: nothing changed. */
  already: boolean
}

/** You took a listing: the Pokémon you gave leaves your Box for good, theirs arrives at that one's level. */
export function applyTake(
  save: SaveData,
  data: GameData,
  t: TakenTrade,
  now: number,
  newId: () => string,
): TradeResult {
  if (tradeApplied(save, t.id)) return { save, received: null, already: true }
  const gone = takeOutOfBox(save, data, t.given.id) ?? save
  const received = receiveTrade(gone, data, t.listed, t.given.level, now, newId)
  const log: TradeLogEntry = {
    id: t.id,
    at: now,
    role: 'taker',
    with: t.with,
    gave: { dex: t.given.dex, level: t.given.level, ...extras(t.given) },
    got: { dex: received.dex, level: received.arrival.level, ...extras(t.listed) },
    ...(received.evolvedTo != null && { evolvedTo: received.evolvedTo }),
    outcome: received.outcome,
  }
  return { save: markDone(received.save, t.id, log), received, already: false }
}

/**
 * Your listing was taken while you were away: it leaves `trades.out` (or, from an old copy of the save, your Box), and
 * the Pokémon given for it arrives at the level of the one you listed. It waits for you to see it (the gold dot).
 */
export function applyTaken(
  save: SaveData,
  data: GameData,
  t: TakenTrade,
  now: number,
  newId: () => string,
): TradeResult {
  if (tradeApplied(save, t.id)) return { save, received: null, already: true }
  const tr = tradesOf(save)
  let next: SaveData = { ...save, trades: { ...tr, out: tr.out.filter((o) => o.listing !== t.id) } }
  if (everyRegionBox(next, data).some((m) => m.inst.id === t.listed.id))
    next = takeOutOfBox(next, data, t.listed.id) ?? next
  const received = receiveTrade(next, data, t.given, t.listed.level, now, newId)
  const log: TradeLogEntry = {
    id: t.id,
    at: now,
    role: 'poster',
    with: t.with,
    gave: { dex: t.listed.dex, level: t.listed.level, ...extras(t.listed) },
    got: { dex: received.dex, level: received.arrival.level, ...extras(t.given) },
    ...(received.evolvedTo != null && { evolvedTo: received.evolvedTo }),
    outcome: received.outcome,
  }
  return { save: markDone(received.save, t.id, log, true), received, already: false }
}

/** A listing of yours ended without a trade: its Pokémon is back (by the catch rule), once. */
export function applyEnded(
  save: SaveData,
  data: GameData,
  listingId: string,
): { save: SaveData; back: Placed | null; already: boolean } {
  if (tradeApplied(save, listingId)) return { save, back: null, already: true }
  const back = listBack(save, data, listingId)
  return { save: markDone(back?.save ?? save, listingId), back, already: false }
}

/** An open listing as the server has it, for tidying up (§5): what it holds and where it came from. */
export interface OpenListing {
  id: string
  code: string
  region: RegionId
  inst: PokemonInstance
  endsAt: number
  want: TradeWant
  visibility: TradeVisibility
  at: number
}

/**
 * The save, made to agree with the server's open listings: a listed Pokémon still in a Box (an older copy of the save,
 * another device) moves out; one the save has never seen listed is added to `trades.out`; one the save lists but the
 * server no longer has (and that was never applied) comes back, so a Pokémon is never lost to a listing that vanished.
 */
export function reconcileListings(
  save: SaveData,
  data: GameData,
  open: OpenListing[],
  known: Set<string>,
): SaveData {
  let next = save
  for (const l of open) {
    const t = tradesOf(next)
    const inOut = t.out.find((o) => o.listing === l.id)
    if (inOut) {
      if (inOut.endsAt !== l.endsAt)
        next = {
          ...next,
          trades: { ...t, out: t.out.map((o) => (o.listing === l.id ? { ...o, endsAt: l.endsAt } : o)) },
        }
      // Out, but also still in a Box: an older copy came back through a sync.
      if (everyRegionBox(next, data).some((m) => m.inst.id === l.inst.id))
        next = takeOutOfBox(next, data, l.inst.id) ?? next
      continue
    }
    const moved = everyRegionBox(next, data).some((m) => m.inst.id === l.inst.id)
      ? (takeOutOfBox(next, data, l.inst.id) ?? next)
      : next
    const t2 = tradesOf(moved)
    const entry: TradeOut = {
      listing: l.id,
      code: l.code,
      region: l.region,
      mon: l.inst,
      at: l.at,
      endsAt: l.endsAt,
      want: l.want,
      visibility: l.visibility,
    }
    next = { ...moved, trades: { ...t2, out: [...t2.out, entry] } }
  }
  // Listed here, unknown to the server (neither open nor waiting to be applied): back to the Box.
  for (const o of tradesOf(next).out) {
    if (open.some((l) => l.id === o.listing) || known.has(o.listing) || tradeApplied(next, o.listing))
      continue
    next = listBack(next, data, o.listing)?.save ?? next
  }
  return next
}

// ---------------------------------------------------------------- taking a listing, as the screens show it

/** Not in the Pokédex of the region it would land in: the NEW tag on the board and in the grids. */
export function newForTrade(save: SaveData, data: GameData, dex: number): boolean {
  const home = homeRegionOf(data, dex)
  return !(home ? pokedexOf(save, home) : save.pokedex).includes(dex)
}

const DAY_MS = 86_400_000

/** Trades taken since midnight UTC, as the save remembers them (the server counts too, and has the last word). */
export function tradesTakenToday(save: SaveData, now: number): number {
  const midnight = Math.floor(now / DAY_MS) * DAY_MS
  return (tradesOf(save).log ?? []).filter((l) => l.role === 'taker' && l.at >= midnight).length
}

export interface TakeChoice {
  at: BoxedMon
  why: ListBlock | null
}

/**
 * Your Pokémon that answer a listing's want, from every region's Box, the ones that can't go carrying why (the poster
 * hasn't started its region, it's your last one…): those that can go first, then the strongest.
 */
export function takeChoices(
  save: SaveData,
  data: GameData,
  want: TradeWant,
  poster: TradeSnapshot,
): TakeChoice[] {
  return tradeChoices(save, data)
    .filter((m) => wantMatches(want, m.inst, poster))
    .map((at) => ({ at, why: tradeBlocked(save, data, at, poster.regions) }))
    .sort(
      (a, b) =>
        Number(!!a.why) - Number(!!b.why) ||
        b.at.inst.level - a.at.inst.level ||
        a.at.inst.dex - b.at.inst.dex,
    )
}

/** Why this listing can't be taken from this save (beyond signing in, friendship and your own): null when it can. */
export type TakeBlock = 'region' | 'daily_cap' | 'no_match'

export function takeBlock(
  save: SaveData,
  data: GameData,
  l: { dex: number; want: TradeWant; poster: TradeSnapshot },
  now: number,
): TakeBlock | null {
  const home = homeRegionOf(data, l.dex)
  if (!home || !tradeRegions(save, data).includes(home)) return 'region'
  if (tradesTakenToday(save, now) >= tradeCfg(data).tradesPerDay) return 'daily_cap'
  if (!takeChoices(save, data, l.want, l.poster).some((c) => !c.why)) return 'no_match'
  return null
}

export interface TakePreview {
  /** What would arrive, where, and how it would be kept. */
  received: Received
  /** The level of your copy it would replace or merge into, if you have one there. */
  mine: number | null
}

/** What giving this Pokémon for that listed one would bring, without doing it: the picker's lines and the confirm. */
export function previewTake(
  save: SaveData,
  data: GameData,
  listed: { dex: number; shiny?: boolean },
  given: PokemonInstance,
): TakePreview {
  const gone = takeOutOfBox(save, data, given.id) ?? save
  const received = receiveTrade(gone, data, listed, given.level, 0, () => 'preview')
  const final = received.evolvedTo ?? listed.dex
  const block = received.region === regionOf(gone) ? gone : gone.parked?.[received.region]
  const plain = (block?.box ?? []).filter((p) => p.dex === final && !p.shiny && !isReviving(p))
  return { received, mine: plain.length ? Math.min(...plain.map((p) => p.level)) : null }
}

/**
 * Your listings taken while you were away whose scene hasn't played yet, oldest first: Home plays them in turn, and
 * the gold dot stays until it has (or until the trade is opened from the Done list).
 */
export function tradesToWatch(save: SaveData): TradeLogEntry[] {
  const unseen = new Set(tradesOf(save).unseen ?? [])
  return (tradesOf(save).log ?? []).filter((l) => unseen.has(l.id)).reverse()
}

/** The trades you've looked at (all of them, or these): the gold dot goes. */
export function markTradesSeen(save: SaveData, ids?: string[]): SaveData {
  const t = tradesOf(save)
  if (!t.unseen?.length) return save
  const unseen = ids ? t.unseen.filter((u) => !ids.includes(u)) : []
  return unseen.length === t.unseen.length ? save : { ...save, trades: { ...t, unseen } }
}

export function markTradeRulesSeen(save: SaveData): SaveData {
  const t = tradesOf(save)
  return t.rulesSeen ? save : { ...save, trades: { ...t, rulesSeen: true } }
}

/** The rules pop-up opens by itself once, when trades are open to this save. */
export const tradeRulesDue = (save: SaveData, data: GameData): boolean =>
  !tradeClosed(save, data) && !tradesOf(save).rulesSeen

/** The region's name, for a line like "Lands in your Johto Box". */
export const regionName = (data: GameData, id: RegionId): string => getRegion(data, id)?.name ?? id
