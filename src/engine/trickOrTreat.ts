// Trick or Treat (docs/29): a card in an area's deck. A ghost floats in with a gauge under it, from 0 to 100, cut into
// sections; each section names the d6 a Trick Ball needs there, the higher the easier, and the last stretch is the flee
// zone. A Treat fills the gauge by a random amount, a Trick Ball rolls the die against the section the gauge is in, and
// a miss leaves the ghost restless: the gauge goes up by `failPush`. Reaching the flee zone, by a Treat or a miss, ends
// it. Treats and Trick Balls are endless and are not items. Every number and outcome is decided here; the screen plays
// them.
import { applyCatch, catchChance, catchTarget, CATCH_DIE } from './catching'
import { DEFAULT_CONFIG } from './defaults'
import { eventOpenTo } from './events'
import type { Rng } from './rng'
import type { RunEvent } from './run'
import {
  TRICK_TIERS,
  type Area,
  type GameData,
  type SaveData,
  type TrickGhost,
  type TrickOrTreatConfig,
  type TrickTier,
} from './types'

/** The gauge's top. */
export const TRICK_GAUGE_MAX = 100

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback
}

export const trickCfg = (data: Pick<GameData, 'config'>): TrickOrTreatConfig =>
  data.config.trickOrTreat ?? DEFAULT_CONFIG.trickOrTreat

/** Switched on for whoever is playing (docs/15 §20). Off: no card is ever dealt. */
export const trickOn = (data: GameData): boolean => eventOpenTo(data.config.trickOrTreat?.access, data)

/** A Treat's fill, cleaned: whole numbers from 1, max never under min. */
export function treatRange(cfg: TrickOrTreatConfig): { min: number; max: number } {
  const d = DEFAULT_CONFIG.trickOrTreat
  const min = clamp(cfg.treatMin, 1, TRICK_GAUGE_MAX, d.treatMin)
  return { min, max: Math.max(min, clamp(cfg.treatMax, 1, TRICK_GAUGE_MAX, d.treatMax)) }
}

/** What a missed Trick Ball adds to the gauge, from 1 (at 0 a miss would cost nothing and Balls alone always win). */
export const failPush = (cfg: TrickOrTreatConfig): number =>
  clamp(cfg.failPush, 1, TRICK_GAUGE_MAX, DEFAULT_CONFIG.trickOrTreat.failPush)

/** One stretch of the gauge: from `from` up to (not including) `to`, where a Trick Ball needs `need` on the d6. */
export interface TrickZone {
  from: number
  to: number
  need: number
}

/** A tier's gauge, as played: its sections end to end from 0, then the flee zone from `flee` to 100. */
export interface TrickBand {
  zones: TrickZone[]
  flee: number
}

/**
 * A tier's gauge, cleaned up from the admin's numbers: the flee zone starts between 1 and 100, sections inside it,
 * sorted, the first one from 0, needs from 1 to 7 (7 = no catch there).
 */
export function trickBand(cfg: TrickOrTreatConfig, tier: TrickTier): TrickBand {
  const t = cfg.tiers?.[tier] ?? DEFAULT_CONFIG.trickOrTreat.tiers[tier]
  const flee = clamp(t.flee, 1, TRICK_GAUGE_MAX, DEFAULT_CONFIG.trickOrTreat.tiers[tier].flee)
  const byFrom = new Map<number, number>()
  for (const s of Array.isArray(t.sections) ? t.sections : []) {
    const from = clamp(s?.from, 0, TRICK_GAUGE_MAX, 0)
    if (from < flee) byFrom.set(from, clamp(s?.need, 1, CATCH_DIE + 1, CATCH_DIE))
  }
  const starts = [...byFrom.keys()].sort((a, b) => a - b)
  if (!starts.length || starts[0]! > 0) {
    byFrom.set(0, starts.length ? byFrom.get(starts[0]!)! : CATCH_DIE)
    starts.unshift(0)
  }
  const zones = starts.map((from, i) => ({ from, to: starts[i + 1] ?? flee, need: byFrom.get(from)! }))
  return { zones, flee }
}

/** The section the gauge is in (its index too), or null in the flee zone. */
export function trickZoneAt(band: TrickBand, gauge: number): { zone: TrickZone; index: number } | null {
  if (gauge >= band.flee) return null
  for (let i = band.zones.length - 1; i >= 0; i--)
    if (gauge >= band.zones[i]!.from) return { zone: band.zones[i]!, index: i }
  return { zone: band.zones[0]!, index: 0 }
}

/** The chance (0–1) that a Trick Ball catches it in a section needing `need`. */
export const trickChance = (need: number): number => catchChance(need, 0)

// ---------------------------------------------------------------- the area's ghosts

const isTier = (t: unknown): t is TrickTier => (TRICK_TIERS as readonly unknown[]).includes(t)

/** The area's ghosts as the card deals them: known species, a known tier, each species once. */
export function trickGhosts(data: GameData, areaId: string): TrickGhost[] {
  const list = trickCfg(data).areas?.[areaId]
  if (!Array.isArray(list)) return []
  const seen = new Set<number>()
  return list.filter((g) => {
    if (!g || !data.species[g.dex] || !isTier(g.tier) || seen.has(g.dex)) return false
    seen.add(g.dex)
    return true
  })
}

/** This area deals Trick or Treat cards: the switch is on for the player and the area has ghosts. */
export const trickDealable = (data: GameData, area: Pick<Area, 'id'>): boolean =>
  trickOn(data) && trickGhosts(data, area.id).length > 0

/** A tier's weight when the card picks a ghost (0 and up). */
export const tierWeight = (cfg: TrickOrTreatConfig, tier: TrickTier): number =>
  Math.max(0, Number(cfg.tiers?.[tier]?.weight ?? DEFAULT_CONFIG.trickOrTreat.tiers[tier].weight) || 0)

/** Each ghost's chance (0–1) of being the one the card brings. */
export function trickOdds(data: GameData, areaId: string): { ghost: TrickGhost; chance: number }[] {
  const cfg = trickCfg(data)
  const list = trickGhosts(data, areaId)
  const total = list.reduce((n, g) => n + tierWeight(cfg, g.tier), 0)
  return list.map((ghost) => ({ ghost, chance: total ? tierWeight(cfg, ghost.tier) / total : 0 }))
}

/** The ghost the card brings, by its tier's weight; null when the area has none (or every weight is 0). */
export function pickTrickGhost(data: GameData, areaId: string, rng: Rng): TrickGhost | null {
  const cfg = trickCfg(data)
  return rng.weighted(trickGhosts(data, areaId), (g) => tierWeight(cfg, g.tier)) ?? null
}

/**
 * The admin's prefill: the area's ghost-type wild Pokémon, each with a tier from its weight against the pool's
 * heaviest entry (40 % of it or more: common; 20 % or more: rare; less: very rare).
 */
export function ghostsFromWildPool(
  area: Pick<Area, 'wildPool'>,
  data: Pick<GameData, 'species'>,
): TrickGhost[] {
  const top = Math.max(0, ...area.wildPool.map((w) => w.weight))
  const out: TrickGhost[] = []
  for (const w of area.wildPool) {
    const s = data.species[w.dex]
    if (
      !s ||
      w.weight <= 0 ||
      (s.type1 !== 'ghost' && s.type2 !== 'ghost') ||
      out.some((g) => g.dex === w.dex)
    )
      continue
    const share = top ? w.weight / top : 0
    out.push({ dex: w.dex, tier: share >= 0.4 ? 'common' : share >= 0.2 ? 'rare' : 'veryRare' })
  }
  return out
}

// ---------------------------------------------------------------- one encounter

export interface TrickState {
  dex: number
  level: number
  tier: TrickTier
  shiny?: boolean
  /** It carries its family's hidden talent (docs/51). */
  talent?: boolean
  /** The gauge, 0–100. */
  gauge: number
  treats: number
  balls: number
  /** Null while it floats there; then caught, or fled. */
  end: null | 'caught' | 'fled'
}

/** The first section's span: where a ghost's gauge may start (its first value to its last). */
export function trickStartRange(cfg: TrickOrTreatConfig, tier: TrickTier): { min: number; max: number } {
  const z = trickBand(cfg, tier).zones[0]!
  return { min: z.from, max: Math.max(z.from, z.to - 1) }
}

/** A gauge's start, drawn evenly over the first section. */
export const trickStartAt = (cfg: TrickOrTreatConfig, tier: TrickTier, rng: Rng): number => {
  const { min, max } = trickStartRange(cfg, tier)
  return rng.int(min, max)
}

export function startTrick(
  enc: {
    dex: number
    level: number
    tier: TrickTier
    shiny?: boolean
    talent?: boolean
  },
  cfg?: TrickOrTreatConfig,
  rng?: Rng,
): TrickState {
  return {
    dex: enc.dex,
    level: enc.level,
    tier: enc.tier,
    ...(enc.shiny && { shiny: true }),
    ...(enc.talent && { talent: true }),
    // Somewhere in the first section, at random (the user's call, 2026-10-15): each ghost starts a little different.
    gauge: cfg && rng ? trickStartAt(cfg, enc.tier, rng) : 0,
    treats: 0,
    balls: 0,
    end: null,
  }
}

/** What a Treat or a Trick Ball did: the gauge before and after, and for a Ball its die. */
export interface TrickStep {
  state: TrickState
  kind: 'treat' | 'ball'
  from: number
  to: number
  /** A Treat's fill, or a miss's push (0 for a catch). */
  amount: number
  /** A Trick Ball's die, what it needed, and whether it caught. */
  die?: number
  need?: number
  caught?: boolean
  fled: boolean
}

/** A Treat: the gauge fills by a random amount from the Treat's range; into the flee zone, it flees. */
export function feedTreat(state: TrickState, cfg: TrickOrTreatConfig, rng: Rng): TrickStep | null {
  if (state.end) return null
  const { min, max } = treatRange(cfg)
  const amount = rng.int(min, max)
  const to = Math.min(TRICK_GAUGE_MAX, state.gauge + amount)
  const fled = to >= trickBand(cfg, state.tier).flee
  return {
    state: { ...state, gauge: to, treats: state.treats + 1, end: fled ? 'fled' : null },
    kind: 'treat',
    from: state.gauge,
    to,
    amount,
    fled,
  }
}

/**
 * A Trick Ball: the d6 against the section the gauge is in. A catch ends it; a miss pushes the gauge up by `failPush`,
 * which may reach the flee zone.
 */
export function throwTrickBall(state: TrickState, cfg: TrickOrTreatConfig, rng: Rng): TrickStep | null {
  if (state.end) return null
  const band = trickBand(cfg, state.tier)
  const here = trickZoneAt(band, state.gauge)
  if (!here) return null
  const die = rng.int(1, CATCH_DIE)
  const caught = die >= here.zone.need
  const amount = caught ? 0 : failPush(cfg)
  const to = Math.min(TRICK_GAUGE_MAX, state.gauge + amount)
  const fled = !caught && to >= band.flee
  return {
    state: { ...state, gauge: to, balls: state.balls + 1, end: caught ? 'caught' : fled ? 'fled' : null },
    kind: 'ball',
    from: state.gauge,
    to,
    amount,
    die,
    need: here.zone.need,
    caught,
    fled,
  }
}

/**
 * FLEE: the player leaves the ghost be (the user's call, 2026-10-20, for those who'd rather skip it). It ends as fled,
 * nothing caught; null once it's over.
 */
export function fleeTrick(state: TrickState): TrickState | null {
  return state.end ? null : { ...state, end: 'fled' }
}

// ---------------------------------------------------------------- balance

export interface TrickPlay {
  /** The best play's catch rate (0–1), the start drawn over the first section: every choice the right one, exactly. */
  best: number
  /** Trick Balls only, from the first throw. */
  ballsOnly: number
  /** Treats until the best section, then Trick Balls. */
  treatsThenBalls: number
  /** The best play at each gauge below the flee zone: true = throw a Ball, false = give a Treat. */
  ballAt: boolean[]
}

/**
 * The tier's catch rates under three plays, computed exactly (the gauge only goes up, so each value follows from the
 * ones above it). The admin shows them next to the numbers; the balance test checks them against a Monte Carlo.
 */
export function trickBestPlay(cfg: TrickOrTreatConfig, tier: TrickTier): TrickPlay {
  const band = trickBand(cfg, tier)
  const { min, max } = treatRange(cfg)
  const push = failPush(cfg)
  const n = band.flee
  const best = new Array<number>(n + TRICK_GAUGE_MAX + 2).fill(0)
  const balls = [...best]
  const mixed = [...best]
  const ballAt: boolean[] = []
  const top = band.zones[band.zones.length - 1]!.from
  const after = (v: number[], g: number) => (g >= n ? 0 : v[g]!)
  const treat = (v: number[], g: number) => {
    let sum = 0
    for (let d = min; d <= max; d++) sum += after(v, Math.min(TRICK_GAUGE_MAX, g + d))
    return sum / (max - min + 1)
  }
  for (let g = n - 1; g >= 0; g--) {
    const p = trickChance(trickZoneAt(band, g)!.zone.need)
    const ball = (v: number[]) => p + (1 - p) * after(v, Math.min(TRICK_GAUGE_MAX, g + push))
    const b = ball(best)
    const t = treat(best, g)
    best[g] = Math.max(b, t)
    ballAt[g] = b >= t
    balls[g] = ball(balls)
    mixed[g] = g < top ? treat(mixed, g) : ball(mixed)
  }
  // The gauge starts anywhere in the first section, evenly: each rate is the average over those starts.
  const { min: s0, max: s1 } = trickStartRange(cfg, tier)
  const avg = (v: number[]) => {
    let sum = 0
    for (let g = s0; g <= s1; g++) sum += v[g]!
    return sum / (s1 - s0 + 1)
  }
  return { best: avg(best), ballsOnly: avg(balls), treatsThenBalls: avg(mixed), ballAt }
}

// ---------------------------------------------------------------- the catch

/** Where a caught ghost went: the team, the Box, in place of a weaker copy, or into your stronger one (nothing new). */
export type TrickPlaced = 'team' | 'box' | 'replaced' | 'merged'

export interface TrickCatch {
  save: SaveData
  events: RunEvent[]
  placed: TrickPlaced
  /** New to the Pokédex. */
  isNew: boolean
  /** The copy it replaced was at this level. */
  replacedLevel?: number
}

/**
 * A caught ghost joins like a wild catch here (catchTarget, applyCatch): the team if it has room, else the Box; a
 * stronger copy replaces your weakest plain one; a shiny is its own. One you already have at its level or stronger
 * merges into yours. A full team never asks: it waits in the Box.
 */
export function applyTrickCatch(
  save: SaveData,
  data: GameData,
  state: TrickState,
  now: number,
  newId: () => string,
): TrickCatch {
  const target = catchTarget(save, state.dex, state.level, 'wild', data, !!state.shiny, save.currentAreaId, !!state.talent)
  if (!target) return { save, events: [], placed: 'merged', isNew: false }
  const res = applyCatch(
    save,
    { dex: state.dex, level: state.level, shiny: state.shiny, talent: state.talent },
    target,
    data,
    now,
    newId,
  )
  const caught = res.events.find((e) => e.kind === 'caught')
  const isNew = caught?.kind === 'caught' && !!caught.isNew
  if (target.mode === 'replace')
    return { save: res.save, events: res.events, placed: 'replaced', isNew, replacedLevel: target.level }
  // A weaker one caught for its talent (docs/51): it merges into yours, which learns the talent.
  if (target.mode === 'learn') return { save: res.save, events: res.events, placed: 'merged', isNew: false }
  return {
    save: res.save,
    events: res.events,
    placed: caught?.kind === 'caught' && caught.joinedTeam ? 'team' : 'box',
    isNew,
  }
}

// ---------------------------------------------------------------- its rules pop-up

/** Its rules pop-up is due: switched on for the player and not seen yet (the first Trick or Treat shows it). */
export const trickRulesDue = (save: SaveData, data: GameData): boolean =>
  trickOn(data) && !save.trickOrTreat?.rulesSeen

export function markTrickRulesSeen(save: SaveData): SaveData {
  return { ...save, trickOrTreat: { ...save.trickOrTreat, rulesSeen: true } }
}
