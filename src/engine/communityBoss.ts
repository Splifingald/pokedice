// The Community Boss (docs/71 §4): a live event where everyone hits one huge boss together. It never hits back: it is
// a bag of HP in coloured gauges. Each player places up to 3 of their Pokémon on it; they leave the Box (as at the Day
// Care) and hit in turn, one every 3 seconds, so each slot every 9 s, for its level × its affinity, all the time. The
// damage is the server's (migration 0146: the game sends no number); this file holds the same rules for what the
// screens show (each Pokémon's hit before it's placed, the gauges from a total, the admin's estimate), the boss's
// settings, and the placed Pokémon kept in the save until they come home. No switch of its own (the user's call,
// 2026-11-11): scheduling one is turning it on.
import { calendarGifts, normaliseCalendarReward } from './calendar'
import { everyRegionBox, type BoxedMon } from './daycare'
import { liveById } from './liveEvents'
import { inWorldRegion, regionOf } from './regions'
import { typeMultiplier } from './typechart'
import type { BossGauge, GameData, LiveEvent, PokeType, PokemonInstance, RegionId, SaveData } from './types'

/** Each slot hits every 9 s: the three take turns, one every 3 seconds. */
export const BOSS_TURN_MS = 3_000
export const BOSS_SLOTS = 3
export const BOSS_HIT_EVERY_MS = BOSS_TURN_MS * BOSS_SLOTS
/** The arena shows this many Pokémon around the boss: the player's, their friends', others (the server picks). */
export const BOSS_FIELD = 20
export const BOSS_MAX_GAUGES = 10
/** An immunity counts this much, so no Pokémon is useless (the user's call). */
export const BOSS_IMMUNE = 0.25

/** The gauges' colours, in the order a new one takes them. */
export const BOSS_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'pink', 'black'] as const
export type BossColor = (typeof BOSS_COLORS)[number]
export const BOSS_COLOR_HEX: Record<BossColor, string> = {
  green: '#34c97a',
  yellow: '#ffd23f',
  orange: '#ff9a3c',
  red: '#f2553f',
  purple: '#9b6bff',
  blue: '#4aa3df',
  pink: '#ff7eb6',
  black: '#4a4e69',
}

/** A new Community Boss: Snorlax, five gauges (10M to 90M HP), each its reward. */
export function newBoss(): LiveEvent['boss'] {
  return {
    dex: 143,
    shiny: false,
    gauges: [
      { hp: 10_000_000, color: 'green', reward: { kind: 'item', key: 'rare-candy', qty: 3 } },
      { hp: 20_000_000, color: 'yellow', reward: { kind: 'item', key: 'ultra-ball', qty: 10 } },
      { hp: 40_000_000, color: 'orange', reward: { kind: 'gold', amount: 20_000 } },
      { hp: 60_000_000, color: 'red', reward: { kind: 'item', key: 'master-ball', qty: 1 } },
      {
        hp: 90_000_000,
        color: 'purple',
        reward: { kind: 'pokemon', dex: 143, level: 30, talent: true, qty: 1 },
      },
    ],
  }
}

const isColor = (v: unknown): v is BossColor => (BOSS_COLORS as readonly unknown[]).includes(v)

/** A Community Boss as saved, filled in and cleaned. */
export function normaliseBoss(raw: Partial<LiveEvent['boss']> | undefined): LiveEvent['boss'] {
  const d = newBoss()
  if (!raw) return d
  const dex = Number(raw.dex)
  const gauges = Array.isArray(raw.gauges)
    ? raw.gauges.flatMap((g, i): BossGauge[] => {
        const hp = Math.round(Number(g?.hp))
        const reward = normaliseCalendarReward(g?.reward)
        return hp >= 1 && reward
          ? [{ hp, color: isColor(g?.color) ? g.color : BOSS_COLORS[i % BOSS_COLORS.length]!, reward }]
          : []
      })
    : d.gauges
  return { dex: Number.isInteger(dex) && dex >= 1 ? dex : d.dex, shiny: raw.shiny === true, gauges }
}

// ------------------------------------------------------------------ the hit

const typesOf = (data: GameData, dex: number): PokeType[] => {
  const s = data.species[dex]
  return s ? [s.type1, ...(s.type2 ? [s.type2] : [])] : []
}

/**
 * A Pokémon's affinity against the boss: its best type on the game's chart against the boss's types (×½ to ×2), an
 * immunity counting ×¼ (migration 0146's boss_affinity, the same rule).
 */
export function bossAffinity(data: GameData, dex: number, bossDex: number): number {
  const mine = typesOf(data, dex)
  const theirs = typesOf(data, bossDex)
  if (!mine.length || !theirs.length) return 1
  const best = Math.max(...mine.map((t) => typeMultiplier(data.typeChart, t, theirs)))
  return best === 0 ? BOSS_IMMUNE : best
}

/** What each of its hits takes off: its level × its affinity, at least 1. */
export const bossHit = (level: number, affinity: number): number => Math.max(1, Math.floor(level * affinity))

/** A placement's damage after `ms` placed: one hit every 9 s. */
export const bossDealt = (hit: number, ms: number): number =>
  Math.max(0, Math.floor(ms / BOSS_HIT_EVERY_MS)) * hit

// ------------------------------------------------------------------ the gauges

export const bossTotalHp = (e: Pick<LiveEvent, 'boss'>): number => e.boss.gauges.reduce((n, g) => n + g.hp, 0)

/** Where the boss stands for a damage total: the gauges broken, the one being hit, its HP left. */
export interface BossStanding {
  broken: number
  /** The gauge being hit (its index), or null once every one is broken. */
  current: number | null
  /** That gauge's HP left, and its whole. */
  left: number
  of: number
}

export function bossStanding(e: Pick<LiveEvent, 'boss'>, total: number): BossStanding {
  let acc = 0
  for (const [i, g] of e.boss.gauges.entries()) {
    if (total < acc + g.hp) return { broken: i, current: i, left: acc + g.hp - total, of: g.hp }
    acc += g.hp
  }
  return { broken: e.boss.gauges.length, current: null, left: 0, of: 0 }
}

/**
 * The admin's estimate (docs/71 §4.5): how long until each gauge breaks, from when it starts, with so many trainers
 * each placing 3 Pokémon of this average hit. Hours, cumulative.
 */
export function bossEstimate(e: Pick<LiveEvent, 'boss'>, trainers: number, avgHit: number): number[] {
  const perHour = Math.max(0, trainers) * BOSS_SLOTS * (3_600_000 / BOSS_HIT_EVERY_MS) * Math.max(0, avgHit)
  let acc = 0
  return e.boss.gauges.map((g) => {
    acc += g.hp
    return perHour > 0 ? acc / perHour : Infinity
  })
}

/** The gifts every participant gets for these gauges broken (at most 20 on one message, as the server sends them). */
export function bossRewardGifts(e: Pick<LiveEvent, 'boss'>, broken: number) {
  return e.boss.gauges
    .slice(0, broken)
    .flatMap((g) => calendarGifts(g.reward))
    .slice(0, 20)
}

/** What stops the admin from saving a Community Boss (empty = fine). */
export function bossProblems(e: LiveEvent, data: GameData): string[] {
  const out: string[] = []
  const b = e.boss
  if (!data.species[b.dex]) out.push(`Unknown Pokémon: #${b.dex}.`)
  if (e.repeat) out.push('A Community Boss runs once: no repeat.')
  if (!b.gauges.length) out.push('The boss has no gauge.')
  if (b.gauges.length > BOSS_MAX_GAUGES) out.push(`At most ${BOSS_MAX_GAUGES} gauges.`)
  for (const [i, g] of b.gauges.entries()) {
    if (!(g.hp >= 1)) out.push(`Gauge ${i + 1} has no HP.`)
    const r = g.reward
    if (r.kind === 'item' && !data.items[r.key]) out.push(`Gauge ${i + 1}: unknown item ${r.key}.`)
    if (r.kind === 'pokemon' && !data.species[r.dex]) out.push(`Gauge ${i + 1}: unknown Pokémon #${r.dex}.`)
  }
  if (bossRewardGifts(e, b.gauges.length).length < b.gauges.flatMap((g) => calendarGifts(g.reward)).length)
    out.push('Every gauge broken would send more than 20 gifts: a message carries 20 at most.')
  return out
}

// ------------------------------------------------------------------ the placed Pokémon

/** A Pokémon placed on the boss: away from its Box until it's taken back or the event ends. */
export interface BossPlaced {
  slot: number
  inst: PokemonInstance
  region: RegionId
  at: number
  /**
   * The event's end as it was placed (ISO): it comes home then even before the content with the event has loaded, or
   * after the admin deleted it. An earlier end (End now) brings it home sooner.
   */
  end: string
}

export const bossPlacedOf = (save: SaveData, eventId: string): BossPlaced[] =>
  save.events?.boss?.[eventId] ?? []

/** Every Pokémon placed, any event's. */
export const allBossPlaced = (save: SaveData): { eventId: string; placed: BossPlaced }[] =>
  Object.entries(save.events?.boss ?? {}).flatMap(([eventId, list]) =>
    list.map((placed) => ({ eventId, placed })),
  )

/**
 * The Pokémon that can be placed: every region's Box (the Day Care's own rule, `everyRegionBox`), never the last of
 * its region's team nor its region's last Pokémon, nor a fossil reviving. Sorted by hit, the best first.
 */
export function bossCandidates(
  save: SaveData,
  data: GameData,
  bossDex: number,
): (BoxedMon & { hit: number; affinity: number })[] {
  return everyRegionBox(save, data)
    .filter((m) => m.inst.revivesAt == null)
    .filter((m) => {
      const block = m.live ? save : save.parked?.[m.region]
      if (!block) return false
      return !((m.inTeam && block.team.length <= 1) || block.box.length <= 1)
    })
    .map((m) => {
      const affinity = bossAffinity(data, m.inst.dex, bossDex)
      return { ...m, affinity, hit: bossHit(m.inst.level, affinity) }
    })
    .sort((a, b) => b.hit - a.hit || b.inst.level - a.inst.level)
}

/** Out of its region's Box and team. */
function takeOut(save: SaveData, at: BoxedMon): SaveData {
  const without = <T extends { box: PokemonInstance[]; team: string[] }>(b: T): T => ({
    ...b,
    box: b.box.filter((p) => p.id !== at.inst.id),
    team: b.team.filter((id) => id !== at.inst.id),
  })
  if (at.live) return without(save)
  const block = save.parked?.[at.region]
  return block ? { ...save, parked: { ...save.parked, [at.region]: without(block) } } : save
}

/** Back into its region's Box (the live one, else a parked one; a region gone: the live one). */
function putBack(save: SaveData, p: BossPlaced): SaveData {
  const here = regionOf(save)
  const block = p.region !== here ? save.parked?.[p.region] : undefined
  if (block)
    return { ...save, parked: { ...save.parked, [p.region]: { ...block, box: [...block.box, p.inst] } } }
  return { ...save, box: [...save.box, p.inst] }
}

const withPlaced = (save: SaveData, eventId: string, list: BossPlaced[]): SaveData => {
  const { [eventId]: _old, ...rest } = save.events?.boss ?? {}
  return { ...save, events: { ...save.events, boss: list.length ? { ...rest, [eventId]: list } : rest } }
}

/**
 * Places a Pokémon in a slot: it leaves its Box; the one there before comes back. Null when it can't be placed (not
 * a candidate, a small world being played: its Box is the world's).
 */
export function placeOnBoss(
  save: SaveData,
  data: GameData,
  e: LiveEvent,
  slot: number,
  uid: string,
  now: number,
): SaveData | null {
  if (slot < 0 || slot >= BOSS_SLOTS || inWorldRegion(save, data)) return null
  const at = bossCandidates(save, data, e.boss.dex).find((m) => m.inst.id === uid)
  if (!at) return null
  const placed = bossPlacedOf(save, e.id)
  const before = placed.find((p) => p.slot === slot)
  let next = takeOut(save, at)
  if (before) next = putBack(next, before)
  const list = [
    ...placed.filter((p) => p.slot !== slot),
    { slot, inst: at.inst, region: at.region, at: now, end: e.end },
  ]
  return withPlaced(
    next,
    e.id,
    list.sort((a, b) => a.slot - b.slot),
  )
}

/** Takes a slot's Pokémon back to its Box. The same save when the slot is empty. */
export function takeBackFromBoss(save: SaveData, eventId: string, slot: number): SaveData {
  const placed = bossPlacedOf(save, eventId)
  const p = placed.find((x) => x.slot === slot)
  if (!p) return save
  return withPlaced(
    putBack(save, p),
    eventId,
    placed.filter((x) => x.slot !== slot),
  )
}

/**
 * Every Pokémon placed on a Community Boss that has ended comes home: at the end it was placed with, or the event's
 * own when the admin ended it sooner. The same save when none does. Not while a small world is played (they wait for
 * the way out), nor while the server's time is unknown.
 */
export function bossHomecoming(save: SaveData, data: GameData, now: number | null): SaveData {
  if (now == null || inWorldRegion(save, data) || !save.events?.boss) return save
  let next = save
  for (const [eventId, list] of Object.entries(save.events.boss)) {
    const e = liveById(data, eventId)
    const sooner = e && e.type === 'boss' ? Date.parse(e.end) : Infinity
    const home = list.filter((p) => now >= Math.min(Date.parse(p.end), sooner))
    if (!home.length) continue
    for (const p of home) next = putBack(next, p)
    next = withPlaced(
      next,
      eventId,
      list.filter((p) => !home.includes(p)),
    )
  }
  return next
}
