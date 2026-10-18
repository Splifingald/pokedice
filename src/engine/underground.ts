// The Underground (docs/34): a live event type. Explorakits open walls of tiles 1 to 3 layers deep; tapping a tile
// rolls the pickaxe die, which takes that many layers off the tile and one fewer off its 4 neighbours. Each strike
// brings the wall closer to collapsing. What a wall hides (orbs, fossils, Arceus's plates) is won only once every tile
// of it is dug out. Players team up by three, one orb colour each: an orb goes to whoever holds its colour, and orbs
// sell only in a full team. Kits, orbs, the pickaxe and the team are the event's; plates and fossils stay for good.
// Every number is the admin's (game_config `underground`); every outcome is decided here.
import { DEFAULT_CONFIG } from './defaults'
import { eventOpenTo } from './events'
import { addFossil } from './fossils'
import { liveEvents, liveFor, liveState } from './liveEvents'
import { regionOfSpecies, unlockedRegions } from './regions'
import type { Rng } from './rng'
import {
  ORB_COLOURS,
  ORB_SIZES,
  UG_LOOT,
  type GameData,
  type ItemDef,
  type LiveEvent,
  type OrbBag,
  type OrbColour,
  type OrbSize,
  type PokeType,
  type SaveData,
  type UgLoot,
  type UndergroundConfig,
  type UndergroundSave,
  type Wall,
  type WallThing,
} from './types'

/** The 17 plates, one per type Arceus can take besides Normal; their names are in strings.csv (`plate.<type>`). */
export const PLATE_TYPES: readonly PokeType[] = [
  'fire',
  'water',
  'grass',
  'electric',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]

const HOUR = 3_600_000
const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}

export const ugCfg = (data: Pick<GameData, 'config'>): UndergroundConfig =>
  data.config.underground ?? DEFAULT_CONFIG.underground

/** Switched on for whoever is playing (docs/15 §20). Off: nowhere in the game, and Arceus changes type freely. */
export const ugOn = (data: GameData): boolean => eventOpenTo(data.config.underground?.access, data)

/** The Underground running for this player: an `underground` live event, theirs by its badges, the switch on. */
export function undergroundLive(save: SaveData, data: GameData, now: number | null): LiveEvent | null {
  if (!ugOn(data) || save.mode === 'extreme') return null
  const live = liveFor(save, data, now)
  return live?.type === 'underground' ? live : null
}

// ------------------------------------------------------------------ the admin's numbers, cleaned

/** The wall's size and strikes, whole numbers in sensible ranges. */
export function wallRules(cfg: UndergroundConfig) {
  const d = DEFAULT_CONFIG.underground.wall
  const w = cfg.wall ?? d
  const cols = int(w.cols, 3, 12, d.cols)
  const rows = int(w.rows, 3, 12, d.rows)
  const itemsMin = int(w.itemsMin, 1, 12, d.itemsMin)
  return {
    cols,
    rows,
    strikes: int(w.strikes, 1, 200, d.strikes),
    layers: [0, 1, 2].map((i) => Math.max(0, Number(w.layers?.[i]) || 0)) as [number, number, number],
    itemsMin,
    itemsMax: Math.max(itemsMin, int(w.itemsMax, 1, 12, d.itemsMax)),
    neighbourLoss: int(w.neighbourLoss, 0, 3, d.neighbourLoss),
  }
}

/** The pickaxe's levels: at least one, each with six whole faces from 1 to 3 and a price from 0. */
export function pickaxeLevels(cfg: UndergroundConfig): { faces: number[]; price: number }[] {
  const rows = (cfg.pickaxe ?? []).filter((l) => Array.isArray(l?.faces) && l.faces.length === 6)
  const list = rows.length ? rows : DEFAULT_CONFIG.underground.pickaxe
  return list.map((l) => ({
    faces: l.faces.map((f) => int(f, 1, 3, 1)),
    price: int(l.price, 0, 10_000_000, 0),
  }))
}

/** The highest pickaxe level. */
export const pickaxeMax = (cfg: UndergroundConfig): number => pickaxeLevels(cfg).length - 1

/** The die's faces at a level (the last level's past the end). */
export const pickaxeFaces = (cfg: UndergroundConfig, level: number): number[] => {
  const list = pickaxeLevels(cfg)
  return list[Math.max(0, Math.min(list.length - 1, level))]!.faces
}

/** Free kits: how many come in a period, how long between two, and how many can wait. */
export function freeKitRules(cfg: UndergroundConfig) {
  const d = DEFAULT_CONFIG.underground.kits
  const k = cfg.kits ?? d
  const amount = int(k.freeAmount, 0, 100, d.freeAmount)
  const hours = Math.max(0.25, Number(k.freePeriodHours) || d.freePeriodHours)
  return {
    amount,
    everyMs: amount > 0 ? (hours * HOUR) / amount : Infinity,
    cap: int(k.freeCap, 0, 100, d.freeCap),
  }
}

export const kitPrice = (cfg: UndergroundConfig): number =>
  int(cfg.kits?.price, 1, 10_000_000, DEFAULT_CONFIG.underground.kits.price)
/** The per-player limit on bought kits; null = none (the admin's 0). */
const kitLimit = (cfg: UndergroundConfig): number | null => {
  const n = int(cfg.kits?.limit, 0, 100_000, 0)
  return n > 0 ? n : null
}

/** An orb's selling price. */
export const orbPrice = (cfg: UndergroundConfig, colour: OrbColour, size: OrbSize): number =>
  int(cfg.prices?.[colour]?.[size], 0, 10_000_000, DEFAULT_CONFIG.underground.prices[colour][size])

// ------------------------------------------------------------------ the event's block in the save

export const emptyBag = (): OrbBag => ({
  red: { s: 0, m: 0, l: 0 },
  blue: { s: 0, m: 0, l: 0 },
  green: { s: 0, m: 0, l: 0 },
})

/** A new event's block: the free kits at their cap, the pickaxe at level 0, nothing else. */
export function freshUnderground(eventId: string, cfg: UndergroundConfig): UndergroundSave {
  return {
    eventId,
    freeKits: freeKitRules(cfg).cap,
    freeAt: null,
    boughtKits: 0,
    boughtCount: 0,
    pickaxe: 0,
    bag: emptyBag(),
    wall: null,
    walls: 0,
    hauls: [],
  }
}

/** Free kits come in, one every `everyMs`, up to the cap; at the cap the clock stops. */
export function refillKits(u: UndergroundSave, cfg: UndergroundConfig, now: number): UndergroundSave {
  const { everyMs, cap } = freeKitRules(cfg)
  let { freeKits, freeAt } = u
  if (freeKits >= cap || !Number.isFinite(everyMs)) freeAt = null
  else if (freeAt == null) freeAt = now + everyMs
  else
    while (freeAt != null && freeAt <= now && freeKits < cap) {
      freeKits++
      freeAt = freeKits >= cap ? null : freeAt + everyMs
    }
  return freeKits === u.freeKits && freeAt === u.freeAt ? u : { ...u, freeKits, freeAt }
}

/**
 * Keeps the save's block in step with the event: a new event starts afresh, an event over takes its kits, orbs,
 * pickaxe and wall with it (plates and fossils stay), and free kits come in. While the switch is off, or the time is
 * unknown, nothing is touched.
 */
export function settleUnderground(save: SaveData, data: GameData, now: number | null): SaveData {
  if (now == null || !ugOn(data)) return save
  const cfg = ugCfg(data)
  const live = undergroundLive(save, data, now)
  const u = save.underground
  if (live) {
    const block = !u || u.eventId !== live.id ? freshUnderground(live.id, cfg) : u
    const next = refillKits(block, cfg, now)
    return next === u ? save : { ...save, underground: next }
  }
  if (!u) return save
  const e = liveEvents(data).find((x) => x.id === u.eventId)
  if (e && liveState(e, now) !== 'ended') return save
  const { underground: _gone, ...rest } = save
  return rest
}

export const kitsHeld = (u: UndergroundSave | undefined): number => (u ? u.freeKits + u.boughtKits : 0)

/** Explorakits this player may still buy this event; null = no limit. */
export function kitsLeftToBuy(u: UndergroundSave | undefined, cfg: UndergroundConfig): number | null {
  const limit = kitLimit(cfg)
  return limit == null ? null : Math.max(0, limit - (u?.boughtCount ?? 0))
}

/** Buys `qty` Explorakits at the Mart's price, within the limit. Null when the purse is short or the limit reached. */
export function buyKits(save: SaveData, data: GameData, now: number | null, qty: number): SaveData | null {
  const u = save.underground
  if (!u || !undergroundLive(save, data, now) || qty <= 0 || !Number.isInteger(qty)) return null
  const cfg = ugCfg(data)
  const left = kitsLeftToBuy(u, cfg)
  if (left != null && qty > left) return null
  const cost = kitPrice(cfg) * qty
  if (save.gold < cost) return null
  return {
    ...save,
    gold: save.gold - cost,
    underground: { ...u, boughtKits: u.boughtKits + qty, boughtCount: u.boughtCount + qty },
  }
}

// ------------------------------------------------------------------ dealing a wall

/** The fossils a wall can hide: every fossil whose Pokémon belongs to a region the player has opened. */
export function wallFossils(save: SaveData, data: GameData): ItemDef[] {
  const open = new Set(unlockedRegions(save, data).map((r) => r.id))
  return Object.values(data.items).filter((it) => {
    if (it.effect.kind !== 'fossil') return false
    const region = regionOfSpecies(data, it.effect.dex)
    return !!region && open.has(region)
  })
}

const shapeOf = (cfg: UndergroundConfig, kind: UgLoot): { w: number; h: number } => {
  const d = DEFAULT_CONFIG.underground.loot.shapes[kind]
  const s = cfg.loot?.shapes?.[kind] ?? d
  return { w: int(s.w, 1, 12, d.w), h: int(s.h, 1, 12, d.h) }
}

const orbSize = (kind: UgLoot): OrbSize | null =>
  kind === 'orbS' ? 's' : kind === 'orbM' ? 'm' : kind === 'orbL' ? 'l' : null

/**
 * A new wall: each tile's layers by the admin's shares, then 2–4 things drawn by weight and placed where they fit. A
 * plate is one the player doesn't hold (none in two places); with all 17 held, or no fossil to find, those weights
 * fall to the orbs. A thing that fits nowhere becomes a small orb, or is left out.
 */
export function dealWall(save: SaveData, data: GameData, id: string, rng: Rng): Wall {
  const held = new Set(save.plates ?? [])
  return dealWallWith(
    ugCfg(data),
    PLATE_TYPES.filter((t) => !held.has(t)),
    wallFossils(save, data).map((it) => it.key),
    id,
    rng,
  )
}

/** `dealWall` from the plates still to find and the fossils (item keys) a wall may hide. */
export function dealWallWith(
  cfg: UndergroundConfig,
  platesLeft: readonly PokeType[],
  fossils: readonly string[],
  id: string,
  rng: Rng,
): Wall {
  const r = wallRules(cfg)
  const n = r.cols * r.rows
  const layerTotal = r.layers[0] + r.layers[1] + r.layers[2]
  const depth = Array.from({ length: n }, () =>
    layerTotal > 0 ? rng.weighted([1, 2, 3], (d) => r.layers[d - 1]!)! : rng.int(1, 3),
  )
  const plates = [...platesLeft]
  const weights = { ...DEFAULT_CONFIG.underground.loot.weights, ...cfg.loot?.weights }
  const colours = { ...DEFAULT_CONFIG.underground.loot.colours, ...cfg.loot?.colours }
  const taken = new Array<boolean>(n).fill(false)
  const things: WallThing[] = []

  const place = (kind: UgLoot): { x: number; y: number; w: number; h: number } | null => {
    const { w, h } = shapeOf(cfg, kind)
    const spots: [number, number][] = []
    for (let y = 0; y + h <= r.rows; y++)
      for (let x = 0; x + w <= r.cols; x++) {
        let free = true
        for (let dy = 0; dy < h && free; dy++)
          for (let dx = 0; dx < w && free; dx++) free = !taken[(y + dy) * r.cols + x + dx]
        if (free) spots.push([x, y])
      }
    if (!spots.length) return null
    const [x, y] = rng.pick(spots)
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken[(y + dy) * r.cols + x + dx] = true
    return { x, y, w, h }
  }

  const count = rng.int(r.itemsMin, r.itemsMax)
  for (let i = 0; i < count; i++) {
    const kind =
      rng.weighted(UG_LOOT, (k) => {
        if (k === 'plate' && !plates.length) return 0
        if (k === 'fossil' && !fossils.length) return 0
        return Math.max(0, Number(weights[k]) || 0)
      }) ?? 'orbS'
    let spot = place(kind)
    let got: UgLoot = kind
    if (!spot && kind !== 'orbS') {
      spot = place('orbS')
      got = 'orbS'
    }
    if (!spot) continue
    const thing: WallThing = { kind: got, ...spot }
    if (orbSize(got))
      thing.colour =
        rng.weighted(ORB_COLOURS, (c) => Math.max(0, Number(colours[c]) || 0)) ?? rng.pick(ORB_COLOURS)
    else if (got === 'fossil') thing.item = rng.pick(fossils)
    else {
      const t = rng.pick(plates)
      thing.plate = t
      plates.splice(plates.indexOf(t), 1)
    }
    things.push(thing)
  }
  return {
    id,
    cols: r.cols,
    rows: r.rows,
    depth,
    things,
    strikes: r.strikes,
    used: 0,
    neighbourLoss: r.neighbourLoss,
  }
}

/** Opens a wall with a kit (a free one first). Null without a kit, with a wall already open, or outside the event. */
export function openWall(save: SaveData, data: GameData, now: number | null, rng: Rng): SaveData | null {
  const u = save.underground
  if (!u || u.wall || !undergroundLive(save, data, now) || kitsHeld(u) <= 0) return null
  const cfg = ugCfg(data)
  const free = u.freeKits > 0
  const spent: UndergroundSave = free
    ? { ...u, freeKits: u.freeKits - 1 }
    : { ...u, boughtKits: u.boughtKits - 1 }
  // Spending a free kit from the cap starts its clock.
  const ticking = free ? refillKits(spent, cfg, now!) : spent
  const wall = dealWall(save, data, `${u.eventId}:${u.walls + 1}`, rng)
  return { ...save, underground: { ...ticking, walls: u.walls + 1, wall } }
}

// ------------------------------------------------------------------ digging

/** The tiles a thing covers. */
export const thingTiles = (wall: Pick<Wall, 'cols'>, t: WallThing): number[] => {
  const out: number[] = []
  for (let dy = 0; dy < t.h; dy++)
    for (let dx = 0; dx < t.w; dx++) out.push((t.y + dy) * wall.cols + t.x + dx)
  return out
}

/** Every tile of it is dug out. */
export const thingDone = (wall: Wall, t: WallThing): boolean =>
  thingTiles(wall, t).every((i) => wall.depth[i] === 0)

/** Still digging, everything dug out, or collapsed (no strikes left with something still buried). */
export function wallStatus(wall: Wall): 'digging' | 'cleared' | 'collapsed' {
  if (wall.things.every((t) => thingDone(wall, t))) return 'cleared'
  return wall.used >= wall.strikes ? 'collapsed' : 'digging'
}

/** One strike: the tile loses `roll` layers, its 4 neighbours `roll − neighbourLoss`. Unchanged when it can't strike. */
export function strikeWall(wall: Wall, tile: number, roll: number): Wall {
  if (wallStatus(wall) !== 'digging' || !(wall.depth[tile]! > 0)) return wall
  const depth = [...wall.depth]
  const hit = (i: number, by: number) => {
    if (by > 0) depth[i] = Math.max(0, depth[i]! - by)
  }
  hit(tile, roll)
  const x = tile % wall.cols
  const y = Math.floor(tile / wall.cols)
  const side = roll - wall.neighbourLoss
  if (x > 0) hit(tile - 1, side)
  if (x < wall.cols - 1) hit(tile + 1, side)
  if (y > 0) hit(tile - wall.cols, side)
  if (y < wall.rows - 1) hit(tile + wall.cols, side)
  return { ...wall, depth, used: wall.used + 1 }
}

/** Rolls the pickaxe die: which face came up, and its value. */
export function rollPickaxe(cfg: UndergroundConfig, level: number, rng: Rng): { face: number; roll: number } {
  const faces = pickaxeFaces(cfg, level)
  const face = rng.int(0, faces.length - 1)
  return { face, roll: faces[face]! }
}

/** A strike on the open wall, rolled here. Null when there's no wall to dig or the tile is already dug out. */
export function strike(
  save: SaveData,
  data: GameData,
  tile: number,
  rng: Rng,
): { save: SaveData; face: number; roll: number } | null {
  const u = save.underground
  const wall = u?.wall
  if (!u || !wall || wallStatus(wall) !== 'digging' || !(wall.depth[tile]! > 0)) return null
  const { face, roll } = rollPickaxe(ugCfg(data), u.pickaxe, rng)
  return { save: { ...save, underground: { ...u, wall: strikeWall(wall, tile, roll) } }, face, roll }
}

// ------------------------------------------------------------------ teams and the haul

/** A team as the server tells it (docs/34 §3): the seat this player holds and who holds each colour. */
export interface UgTeam {
  me: OrbColour | null
  seats: Partial<Record<OrbColour, { id: string; name: string }>>
}

/** Every colour is held: orbs can be sold. */
export const teamFull = (team: UgTeam | null | undefined): boolean =>
  !!team && ORB_COLOURS.every((c) => !!team.seats[c])

/** Who an orb goes to: a teammate holding its colour, else this player (solo, their own colour, or a free seat). */
export function orbOwner(
  colour: OrbColour,
  team: UgTeam | null | undefined,
): { id: string; name: string } | null {
  const seat = team?.seats[colour]
  return seat && team!.me !== colour ? seat : null
}

export interface HaulLine {
  thing: WallThing
  /** Into the orb bag; sent to a teammate; to the Box as a reviving fossil; a new plate; lost in the rubble. */
  outcome: 'bag' | 'sent' | 'box' | 'plate' | 'lost'
  to?: { id: string; name: string }
}

/** An orb going to a teammate: what the server is told (docs/34 §3). */
export interface SentOrb {
  colour: OrbColour
  size: OrbSize
  to: string
}

/** What the wall gave: each thing and where it goes. Things not fully dug out are lost. */
export function wallHaul(
  wall: Wall,
  team: UgTeam | null | undefined,
  held: readonly PokeType[] = [],
): HaulLine[] {
  return wall.things.map((thing): HaulLine => {
    if (!thingDone(wall, thing)) return { thing, outcome: 'lost' }
    if (thing.kind === 'fossil') return { thing, outcome: 'box' }
    if (thing.kind === 'plate') return { thing, outcome: held.includes(thing.plate!) ? 'lost' : 'plate' }
    const to = orbOwner(thing.colour!, team)
    return to ? { thing, outcome: 'sent', to } : { thing, outcome: 'bag' }
  })
}

/**
 * The finished wall's haul into the save, once: orbs into the bag, plates kept for good, fossils to the Box reviving.
 * The wall closes. `sent` lists the orbs owed to teammates, for the server.
 */
export function applyHaul(
  save: SaveData,
  data: GameData,
  team: UgTeam | null | undefined,
  now: number,
  newId: () => string,
): { save: SaveData; lines: HaulLine[]; sent: SentOrb[] } | null {
  const u = save.underground
  const wall = u?.wall
  if (!u || !wall || wallStatus(wall) === 'digging') return null
  const lines = wallHaul(wall, team, save.plates ?? [])
  if (u.hauls.includes(wall.id))
    return { save: { ...save, underground: { ...u, wall: null } }, lines, sent: [] }
  const bag: OrbBag = { red: { ...u.bag.red }, blue: { ...u.bag.blue }, green: { ...u.bag.green } }
  const sent: SentOrb[] = []
  let next: SaveData = save
  const plates = [...(save.plates ?? [])]
  for (const l of lines) {
    const size = orbSize(l.thing.kind)
    if (l.outcome === 'bag' && size) bag[l.thing.colour!][size]++
    else if (l.outcome === 'sent' && size) sent.push({ colour: l.thing.colour!, size, to: l.to!.id })
    else if (l.outcome === 'plate') plates.push(l.thing.plate!)
    else if (l.outcome === 'box') {
      const item = data.items[l.thing.item!]
      if (item) next = addFossil(next, item, data, now, newId())
    }
  }
  const outbox = sent.length ? [...(u.outbox ?? []), { wallId: wall.id, orbs: sent }] : u.outbox
  const underground: UndergroundSave = {
    ...u,
    bag,
    wall: null,
    hauls: [...u.hauls, wall.id].slice(-50),
    ...(outbox && { outbox }),
  }
  next = { ...next, underground, ...(plates.length !== (save.plates ?? []).length ? { plates } : {}) }
  return { save: next, lines, sent }
}

/** Orbs teammates dug up for this player (the server's inbox) go into the bag, each delivery once. */
export function receiveOrbs(
  save: SaveData,
  gifts: readonly { id: string; orbs: readonly { colour: OrbColour; size: OrbSize }[] }[],
): SaveData {
  const u = save.underground
  const seen = new Set(u?.received ?? [])
  const fresh = gifts.filter((g) => !seen.has(g.id))
  if (!u || !fresh.length) return save
  const bag: OrbBag = { red: { ...u.bag.red }, blue: { ...u.bag.blue }, green: { ...u.bag.green } }
  for (const g of fresh)
    for (const o of g.orbs) if (bag[o.colour] && ORB_SIZES.includes(o.size)) bag[o.colour][o.size]++
  const received = [...(u.received ?? []), ...fresh.map((g) => g.id)].slice(-100)
  return { ...save, underground: { ...u, bag, received } }
}

/** The server has these walls' orbs: they leave the outbox. */
export function clearOutbox(save: SaveData, wallIds: readonly string[]): SaveData {
  const u = save.underground
  if (!u?.outbox?.length) return save
  const outbox = u.outbox.filter((w) => !wallIds.includes(w.wallId))
  if (outbox.length === u.outbox.length) return save
  return { ...save, underground: { ...u, outbox } }
}

// ------------------------------------------------------------------ the pickaxe and selling

/** The next pickaxe level and its price; null at the top. */
export function nextPickaxe(
  cfg: UndergroundConfig,
  level: number,
): { level: number; faces: number[]; price: number } | null {
  const list = pickaxeLevels(cfg)
  const next = list[level + 1]
  return next ? { level: level + 1, ...next } : null
}

/** Buys the next pickaxe level. Null at the top or when the purse is short. */
export function upgradePickaxe(save: SaveData, data: GameData, now: number | null): SaveData | null {
  const u = save.underground
  if (!u || !undergroundLive(save, data, now)) return null
  const next = nextPickaxe(ugCfg(data), u.pickaxe)
  if (!next || save.gold < next.price) return null
  return { ...save, gold: save.gold - next.price, underground: { ...u, pickaxe: next.level } }
}

export const orbCount = (bag: OrbBag): number =>
  ORB_COLOURS.reduce((n, c) => n + ORB_SIZES.reduce((m, s) => m + (bag[c]?.[s] ?? 0), 0), 0)

/** What the bag sells for. */
export const orbsValue = (bag: OrbBag, cfg: UndergroundConfig): number =>
  ORB_COLOURS.reduce(
    (n, c) => n + ORB_SIZES.reduce((m, s) => m + (bag[c]?.[s] ?? 0) * orbPrice(cfg, c, s), 0),
    0,
  )

/** Selling is open: orbs to sell, and a full team when the admin asks for one. */
export const canSell = (save: SaveData, data: GameData, team: UgTeam | null | undefined): boolean => {
  const u = save.underground
  if (!u || !orbCount(u.bag)) return false
  return !ugCfg(data).sellNeedsFull || teamFull(team)
}

/** Sells every orb in the bag into the live region's ₽. Null when selling isn't open. */
export function sellOrbs(
  save: SaveData,
  data: GameData,
  now: number | null,
  team: UgTeam | null | undefined,
): SaveData | null {
  const u = save.underground
  if (!u || !undergroundLive(save, data, now) || !canSell(save, data, team)) return null
  return { ...save, gold: save.gold + orbsValue(u.bag, ugCfg(data)), underground: { ...u, bag: emptyBag() } }
}

// ------------------------------------------------------------------ what a wall yields (the admin, the balance pass)

/**
 * A plain player's next strike: a tile of something half uncovered first (its deepest tile), else the tile with the
 * most layers around it. It sees only what a player sees: layers, and things where tiles are dug out.
 */
export function plainStrikeTile(wall: Wall): number {
  const open = wall.depth.map((d, i) => (d > 0 ? i : -1)).filter((i) => i >= 0)
  const seen = wall.things.filter(
    (t) => !thingDone(wall, t) && thingTiles(wall, t).some((i) => wall.depth[i] === 0),
  )
  const pool = seen.length ? seen.flatMap((t) => thingTiles(wall, t).filter((i) => wall.depth[i]! > 0)) : open
  const around = (i: number) => {
    const x = i % wall.cols
    const y = Math.floor(i / wall.cols)
    let n = wall.depth[i]!
    if (x > 0) n += wall.depth[i - 1]!
    if (x < wall.cols - 1) n += wall.depth[i + 1]!
    if (y > 0) n += wall.depth[i - wall.cols]!
    if (y < wall.rows - 1) n += wall.depth[i + wall.cols]!
    return n
  }
  const score = seen.length ? (i: number) => wall.depth[i]! : around
  return pool.reduce((best, i) => (score(i) > score(best) ? i : best), pool[0]!)
}

export interface WallYield {
  /** Things a wall hides, and those dug out, on average. */
  hidden: number
  won: number
  /** ₽ the orbs dug out sell for, on average; fossils and plates won per wall. */
  orbGold: number
  fossils: number
  plates: number
  /** Share of walls dug out completely. */
  cleared: number
}

/** `walls` walls at a pickaxe level, dug the plain way: what one gives on average. Plates are counted as if none were held. */
export function wallYield(cfg: UndergroundConfig, level: number, walls: number, rng: Rng): WallYield {
  const out: WallYield = { hidden: 0, won: 0, orbGold: 0, fossils: 0, plates: 0, cleared: 0 }
  for (let k = 0; k < walls; k++) {
    let wall = dealWallWith(cfg, PLATE_TYPES, ['fossil'], `sim:${k}`, rng)
    while (wallStatus(wall) === 'digging')
      wall = strikeWall(wall, plainStrikeTile(wall), rollPickaxe(cfg, level, rng).roll)
    out.hidden += wall.things.length
    if (wallStatus(wall) === 'cleared') out.cleared++
    for (const t of wall.things) {
      if (!thingDone(wall, t)) continue
      out.won++
      const size = orbSize(t.kind)
      if (size) out.orbGold += orbPrice(cfg, t.colour!, size)
      else if (t.kind === 'fossil') out.fossils++
      else out.plates++
    }
  }
  const n = Math.max(1, walls)
  return {
    hidden: out.hidden / n,
    won: out.won / n,
    orbGold: out.orbGold / n,
    fossils: out.fossils / n,
    plates: out.plates / n,
    cleared: out.cleared / n,
  }
}

// ------------------------------------------------------------------ the rules pop-up

/** Its rules are due: the event runs for this player and they haven't seen them this event. */
export const ugRulesDue = (save: SaveData, data: GameData, now: number | null): boolean =>
  !!undergroundLive(save, data, now) && !!save.underground && !save.underground.rulesSeen

export function markUgRulesSeen(save: SaveData): SaveData {
  const u = save.underground
  return !u || u.rulesSeen ? save : { ...save, underground: { ...u, rulesSeen: true } }
}

// ------------------------------------------------------------------ Arceus and the plates

/**
 * The types the player's Arceus may take: those of the plates held. Undefined while the Underground is switched off:
 * Arceus then changes type freely, as before (a feature switched off is nowhere in the game).
 */
export const plateTypes = (save: SaveData, data: GameData): PokeType[] | undefined =>
  ugOn(data) ? [...(save.plates ?? [])] : undefined
