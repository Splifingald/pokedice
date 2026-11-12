// Type Rush (docs/71 §3): a live event about one type. While it runs the player's attacks of that type hit × its boost
// (never the foe's), and quests about Pokémon of that type — catch them, K.O. foes with them, evolve them, deal
// damage, hatch them, land combos, win raids with one on the team — count up. Each quest is one counter with steps
// (Catch 5, then 10, then 20); a step reached and validated pays its Rush points into the event's gauge, whose
// rewards (items, ₽, Pokémon) are given as the points reach them. Validating happens when the player opens the
// event: what they did shows ticking green. One done in time but never opened is settled by a last pop-up after the
// end. No switch of its own (the user's call, 2026-11-11): scheduling one is turning it on.
import type { BattleState } from './battle'
import { calendarGifts, normaliseCalendarReward } from './calendar'
import type { UpgradeLevels } from './damage'
import { GIFT_HOME, placeGifts, type GiftLanded } from './gifts'
import { liveById, liveList, type LiveSet } from './liveEvents'
import type { RaidLogEntry } from './raidBattle'
import {
  COMBO_KEYS,
  POKE_TYPES,
  RUSH_QUEST_KINDS,
  type CalendarReward,
  type ComboKey,
  type GameData,
  type LiveEvent,
  type PokeType,
  type RushGaugeRow,
  type RushProgress,
  type RushQuest,
  type RushQuestKind,
  type SaveData,
} from './types'

const DAY = 24 * 3_600_000
const WEEK = 7 * DAY
/** An ended run's progress stays this long in the save, for its last pop-up. */
export const RUSH_KEPT_MS = 30 * DAY
/** Steps per quest and quests per event, at most (the admin's editor and the save stay small). */
export const RUSH_MAX_STEPS = 6
export const RUSH_MAX_QUESTS = 12
export const RUSH_MAX_GAUGE = 10

/** A Pokémon of each type for the default gauge's last reward: early, well known, of that type (the admin may change it). */
export const RUSH_TYPE_MON: Record<PokeType, number> = {
  normal: 133,
  fire: 4,
  water: 7,
  electric: 25,
  grass: 1,
  ice: 361,
  fighting: 66,
  poison: 23,
  ground: 50,
  flying: 16,
  psychic: 63,
  bug: 123,
  rock: 74,
  ghost: 92,
  dragon: 147,
  dark: 261,
  steel: 374,
  fairy: 35,
}

/** A new Type Rush's quests (docs/71 §3.2): 330 points in all. */
export function defaultRushQuests(): RushQuest[] {
  const q = (id: string, kind: RushQuestKind, steps: [number, number][], combo?: 'any'): RushQuest => ({
    id,
    kind,
    ...(combo && { combo }),
    steps: steps.map(([target, points]) => ({ target, points })),
  })
  return [
    q('catch', 'catch', [
      [5, 10],
      [10, 15],
      [20, 25],
    ]),
    q('ko', 'ko', [
      [10, 10],
      [25, 15],
      [50, 25],
    ]),
    q('evolve', 'evolve', [
      [1, 10],
      [3, 15],
      [5, 25],
    ]),
    q('damage', 'damage', [
      [2000, 10],
      [5000, 15],
      [10000, 25],
    ]),
    q('hatch', 'hatch', [
      [1, 15],
      [3, 25],
    ]),
    q(
      'combo',
      'combo',
      [
        [5, 10],
        [15, 15],
        [30, 25],
      ],
      'any',
    ),
    q('raid', 'raid', [
      [1, 15],
      [3, 25],
    ]),
  ]
}

/** A new Type Rush's gauge: Poké Balls, Rare Candies, ₽, Ultra Balls, then a Pokémon of the type with its talent. */
export function defaultRushGauge(type: PokeType): RushGaugeRow[] {
  return [
    { at: 50, reward: { kind: 'item', key: 'poke-ball', qty: 10 } },
    { at: 100, reward: { kind: 'item', key: 'rare-candy', qty: 3 } },
    { at: 175, reward: { kind: 'gold', amount: 5000 } },
    { at: 250, reward: { kind: 'item', key: 'ultra-ball', qty: 5 } },
    { at: 300, reward: { kind: 'pokemon', dex: RUSH_TYPE_MON[type], level: 30, talent: true, qty: 1 } },
  ]
}

/** A new Type Rush's settings: Fire, +20 %, the default quests and gauge. */
export function newRush(type: PokeType = 'fire'): LiveEvent['rush'] {
  return { type, rotate: [], boost: 1.2, quests: defaultRushQuests(), gauge: defaultRushGauge(type) }
}

const isType = (v: unknown): v is PokeType => (POKE_TYPES as readonly unknown[]).includes(v)
const int = (v: unknown, min: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min ? v : null

/** A Type Rush as saved, filled in and cleaned (an older admin's row, a hand edit). */
export function normaliseRush(raw: Partial<LiveEvent['rush']> | undefined): LiveEvent['rush'] {
  const d = newRush(isType(raw?.type) ? raw.type : 'fire')
  if (!raw) return d
  const quests = Array.isArray(raw.quests)
    ? raw.quests.flatMap((q): RushQuest[] => {
        if (!q || typeof q.id !== 'string' || !(RUSH_QUEST_KINDS as readonly string[]).includes(q.kind))
          return []
        const steps = (Array.isArray(q.steps) ? q.steps : []).flatMap((s) => {
          const target = int(s?.target, 1)
          const points = int(s?.points, 0)
          return target != null && points != null ? [{ target, points }] : []
        })
        const combo =
          q.kind === 'combo' && (COMBO_KEYS as readonly unknown[]).includes(q.combo) ? q.combo : undefined
        return [{ id: q.id, kind: q.kind, ...(q.kind === 'combo' && { combo: combo ?? 'any' }), steps }]
      })
    : d.quests
  const gauge = Array.isArray(raw.gauge)
    ? raw.gauge.flatMap((g): RushGaugeRow[] => {
        const at = int(g?.at, 1)
        const reward = normaliseCalendarReward(g?.reward)
        return at != null && reward ? [{ at, reward }] : []
      })
    : d.gauge
  const boost = Number(raw.boost)
  return {
    type: d.type,
    rotate: (Array.isArray(raw.rotate) ? raw.rotate : []).filter(isType),
    boost: Number.isFinite(boost) && boost >= 1 ? boost : d.boost,
    quests,
    gauge: [...gauge].sort((a, b) => a.at - b.at),
  }
}

// ------------------------------------------------------------------ the run's type and boost

/**
 * The type of this run: its own, or for a recurring one with a rotation, the rotation's type for the week it starts
 * in (weeks counted from 1970, so every run of a weekly rule moves one step, and the admin's preview agrees).
 */
export function rushType(e: Pick<LiveEvent, 'start' | 'rush'>): PokeType {
  const r = e.rush
  if (!r.rotate.length) return r.type
  const week = Math.floor(Date.parse(e.start) / WEEK)
  return r.rotate[
    (((Number.isFinite(week) ? week : 0) % r.rotate.length) + r.rotate.length) % r.rotate.length
  ]!
}

/** The Type Rushes in this set (one at a time, by the admin's check; the first counts if two ever met). */
export const rushesOf = (live: LiveSet): LiveEvent[] =>
  liveList(live).filter((e) => e.type === 'rush' && !!e.rush)

/** The running Type Rush's boost: its type and multiplier; null without one (or at ×1). */
export function rushBoost(live: LiveSet): { type: PokeType; multiplier: number } | null {
  const e = rushesOf(live)[0]
  if (!e || !(e.rush.boost > 1)) return null
  return { type: rushType(e), multiplier: e.rush.boost }
}

/** The player's side's levels with the running Type Rush's boost (unchanged without one). */
export function withRush(levels: UpgradeLevels, live: LiveSet): UpgradeLevels {
  const r = rushBoost(live)
  return r ? { ...levels, rush: r } : levels
}

// ------------------------------------------------------------------ what counts

/**
 * Something the player did that a quest may count: of a Pokémon with these types (either of them makes it "of the
 * type"); `amount` for damage (else 1); `combo` for a combo.
 */
export interface RushFact {
  kind: RushQuestKind
  types: readonly (PokeType | null | undefined)[]
  amount?: number
  combo?: ComboKey
}

/** A species' types, for a fact (none for a species the game doesn't know). */
export const typesOf = (data: GameData, dex: number): PokeType[] => {
  const s = data.species[dex]
  return s ? [s.type1, ...(s.type2 ? [s.type2] : [])] : []
}

const emptyProgress = (e: LiveEvent): RushProgress => ({
  type: rushType(e),
  end: e.end,
  counts: {},
  done: {},
  points: 0,
  given: 0,
})

/** This run's progress in the save (nothing done yet: zeros). */
export const rushProgressOf = (save: SaveData, e: LiveEvent): RushProgress =>
  save.events?.rush?.[e.id] ?? emptyProgress(e)

/** Does this quest count this fact, for this type? */
function counts(q: RushQuest, f: RushFact, type: PokeType): boolean {
  if (q.kind !== f.kind || !f.types.includes(type)) return false
  return q.kind !== 'combo' || !q.combo || q.combo === 'any' || q.combo === f.combo
}

/**
 * The facts added to every running Type Rush's counters (they count only while it runs: `live` is what runs now).
 * The same save when nothing counted. Ended runs over 30 days old are dropped on the way.
 */
export function countRush(save: SaveData, live: LiveSet, facts: readonly RushFact[], now: number): SaveData {
  const rushes = rushesOf(live)
  if (!rushes.length || !facts.length) return save
  let all = pruneRush(save.events?.rush ?? {}, now)
  let changed = all !== save.events?.rush
  for (const e of rushes) {
    const type = rushType(e)
    const p = all[e.id] ?? emptyProgress(e)
    let next: Record<string, number> | null = null
    for (const q of e.rush.quests)
      for (const f of facts)
        if (counts(q, f, type)) {
          next ??= { ...p.counts }
          next[q.id] = (next[q.id] ?? 0) + Math.max(0, Math.round(f.amount ?? 1))
        }
    if (next) {
      all = { ...all, [e.id]: { ...p, counts: next } }
      changed = true
    }
  }
  return changed ? { ...save, events: { ...save.events, rush: all } } : save
}

/** The runs ended more than 30 days ago leave the save (the same object when none did). */
function pruneRush(all: Record<string, RushProgress>, now: number): Record<string, RushProgress> {
  const old = Object.entries(all).filter(([, p]) => Date.parse(p.end) + RUSH_KEPT_MS < now)
  if (!old.length) return all
  const out = { ...all }
  for (const [id] of old) delete out[id]
  return out
}

// ------------------------------------------------------------------ what the player sees

/** A quest as its card shows it: its step to come (or its last, when all are done), the counter, done or not. */
export interface RushCard {
  quest: RushQuest
  /** The step shown (0-based). */
  step: number
  count: number
  target: number
  points: number
  /** Reached, waiting to be validated (the red dot, then the green tick). */
  ready: boolean
  /** Every step validated. */
  finished: boolean
}

/** Each quest's card, in the pop-up's order: ready ones and the closest to done first; finished ones last. */
export function rushCards(save: SaveData, e: LiveEvent): RushCard[] {
  const p = rushProgressOf(save, e)
  const cards = e.rush.quests
    .filter((q) => q.steps.length > 0)
    .map((quest): RushCard => {
      const done = Math.min(quest.steps.length, p.done[quest.id] ?? 0)
      const finished = done >= quest.steps.length
      const step = finished ? quest.steps.length - 1 : done
      const s = quest.steps[step]!
      const count = p.counts[quest.id] ?? 0
      return {
        quest,
        step,
        count,
        target: s.target,
        points: s.points,
        ready: !finished && count >= s.target,
        finished,
      }
    })
  const share = (c: RushCard) => (c.finished ? -1 : Math.min(1, c.count / c.target))
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => share(b.c) - share(a.c) || a.i - b.i)
    .map((x) => x.c)
}

/** The Rush points every step of every quest pays: the gauge's whole length. */
export const rushTotalPoints = (e: LiveEvent): number =>
  e.rush.quests.reduce((n, q) => n + q.steps.reduce((m, s) => m + s.points, 0), 0)

/** Something to validate or give: the red dot on its square. */
export function rushPending(save: SaveData, e: LiveEvent): boolean {
  if (rushCards(save, e).some((c) => c.ready)) return true
  const p = rushProgressOf(save, e)
  const next = e.rush.gauge[p.given]
  return !!next && next.at <= p.points
}

/** One step validated: its quest, which step, what it paid. */
export interface RushTick {
  questId: string
  step: number
  points: number
}

/** What opening the event did: the steps ticked, the points before and after, the rewards given and where they went. */
export interface RushValidation {
  save: SaveData
  ticks: RushTick[]
  before: number
  after: number
  rewards: { index: number; row: RushGaugeRow; landed: GiftLanded[] }[]
}

/**
 * Opening the event validates what's done: every step reached pays its points (several in a row when the counter ran
 * past them), then every gauge reward the points reach is given (into the region being played, as a gift). Null when
 * there's nothing to validate or give.
 */
export function validateRush(
  save: SaveData,
  data: GameData,
  e: LiveEvent,
  now: number,
  newId: () => string,
): RushValidation | null {
  const p = rushProgressOf(save, e)
  const done = { ...p.done }
  const ticks: RushTick[] = []
  for (const q of e.rush.quests) {
    const count = p.counts[q.id] ?? 0
    let d = done[q.id] ?? 0
    while (d < q.steps.length && count >= q.steps[d]!.target) {
      ticks.push({ questId: q.id, step: d, points: q.steps[d]!.points })
      d++
    }
    done[q.id] = d
  }
  const before = p.points
  const after = before + ticks.reduce((n, t) => n + t.points, 0)
  let next = save
  let given = p.given
  const rewards: RushValidation['rewards'] = []
  while (given < e.rush.gauge.length && e.rush.gauge[given]!.at <= after) {
    const row = e.rush.gauge[given]!
    // A Pokémon goes to its own region, locked until one there reaches its level (docs/71 §5).
    const placed = placeGifts(next, data, calendarGifts(row.reward, GIFT_HOME), now, newId)
    next = placed.save
    rewards.push({ index: given, row, landed: placed.landed })
    given++
  }
  if (!ticks.length && !rewards.length) return null
  const all = { ...(next.events?.rush ?? {}), [e.id]: { ...p, done, points: after, given } }
  return { save: { ...next, events: { ...next.events, rush: all } }, ticks, before, after, rewards }
}

/**
 * The ended runs with something done in time and never validated (their last pop-up, docs/71 §3.6), the earliest
 * ended first. A run the admin has since deleted settles nothing.
 */
export function rushToSettle(save: SaveData, data: GameData, now: number): LiveEvent[] {
  return Object.entries(save.events?.rush ?? {})
    .filter(([, p]) => Date.parse(p.end) <= now && Date.parse(p.end) + RUSH_KEPT_MS > now)
    .flatMap(([id]) => {
      const e = liveById(data, id)
      return e && e.type === 'rush' && rushPending(save, e) ? [e] : []
    })
    .sort((a, b) => Date.parse(a.end) - Date.parse(b.end))
}

// ------------------------------------------------------------------ facts from a fight

/**
 * A fight's log as Type Rush facts: the player's hits (damage and their combo) and the foes they K.O.'d, each counted
 * for the Pokémon that did it. `attacker` is the player's Pokémon in front before this log (a turn's or a double
 * battle's focus in the log moves it on, a raid's front too); `own` the player's Pokémon by uid and dex (an ally's, a
 * friend's or an NPC's in a raid aren't there, so they count nothing). A raid's log (`RaidLogEntry`) holds a fight's.
 */
export function rushFightFacts(
  log: readonly RaidLogEntry[],
  attacker: string | null,
  own: Readonly<Record<string, number>>,
  data: GameData,
): RushFact[] {
  const facts: RushFact[] = []
  let by = attacker
  for (const l of log) {
    if (l.kind === 'turn' && l.side === 'player') by = l.uid
    else if (l.kind === 'focus') by = l.own
    else if (l.kind === 'raid_front') by = l.actor === 'ally' ? l.ally : null
    const dex = by != null ? own[by] : undefined
    if (dex == null) continue
    const types = typesOf(data, dex)
    if (l.kind === 'damage' && l.side === 'player' && l.target === 'enemy') {
      facts.push({ kind: 'damage', types, amount: l.amount })
      if (l.result.combo) facts.push({ kind: 'combo', types, combo: l.result.combo.key })
    } else if (l.kind === 'faint' && l.side === 'enemy') facts.push({ kind: 'ko', types })
  }
  return facts
}

/** The player's Pokémon in front of a fight, and its team by uid → dex (for `rushFightFacts`). */
export function rushFightSides(s: BattleState): { attacker: string | null; own: Record<string, number> } {
  return {
    attacker: s.player[s.activeIndex]?.uid ?? null,
    own: Object.fromEntries(s.player.map((b) => [b.uid, b.dex])),
  }
}

// ------------------------------------------------------------------ the admin's check

/** What stops the admin from saving a Type Rush (empty = fine). */
export function rushProblems(e: LiveEvent, data: GameData): string[] {
  const out: string[] = []
  const r = e.rush
  if (!(r.boost >= 1)) out.push('Type Rush’s boost is below +0 %.')
  if (!r.quests.length) out.push('Type Rush has no quest.')
  if (r.quests.length > RUSH_MAX_QUESTS) out.push(`At most ${RUSH_MAX_QUESTS} quests.`)
  for (const [i, q] of r.quests.entries()) {
    const name = `Quest ${i + 1}`
    if (!q.steps.length) out.push(`${name} has no step.`)
    if (q.steps.length > RUSH_MAX_STEPS) out.push(`${name}: at most ${RUSH_MAX_STEPS} steps.`)
    q.steps.forEach((s, j) => {
      if (j > 0 && s.target <= q.steps[j - 1]!.target)
        out.push(`${name}: each step's target must be above the one before.`)
    })
  }
  if (new Set(r.quests.map((q) => q.id)).size !== r.quests.length) out.push('Two quests share an id.')
  if (!r.gauge.length) out.push('The gauge has no reward.')
  if (r.gauge.length > RUSH_MAX_GAUGE) out.push(`At most ${RUSH_MAX_GAUGE} rewards on the gauge.`)
  const total = rushTotalPoints(e)
  const last = Math.max(0, ...r.gauge.map((g) => g.at))
  if (last > total) out.push(`The last reward needs ${last} points; the quests pay ${total}.`)
  for (const g of r.gauge) {
    const rw: CalendarReward = g.reward
    if (rw.kind === 'item' && !data.items[rw.key]) out.push(`Unknown item: ${rw.key}.`)
    if (rw.kind === 'pokemon' && !data.species[rw.dex]) out.push(`Unknown Pokémon: #${rw.dex}.`)
  }
  if (e.repeat && r.rotate.length === 1) out.push('A rotation of one type: pick the type instead.')
  return out
}
