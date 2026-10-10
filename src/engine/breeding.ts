// Breeding at the Day Care (docs/15): who can make an Egg with whom (the real Egg groups, src/data/egg-groups.json),
// the pairs the checks look at, and the two clocks that lay the Eggs: every `breedHours` for pairs that share an Egg
// group, every `breedDittoHours` for pairs with a Ditto. One Egg waits at a time; Egg now buys the next check early.
// The hatching itself is `hatchEgg` in daycare.ts.
import { dayCareOf, isDayCareOpen } from './daycare'
import type { Rng } from './rng'
import type { DayCareGuest, DayCareResident, DayCareState, EggParent, GameData, SaveData } from './types'

const HOUR = 3_600_000

export const isDitto = (data: GameData, dex: number) => (data.eggGroups[dex]?.g ?? []).includes('Ditto')
export const isLegendary = (data: GameData, dex: number) => data.eggGroups[dex]?.l === 1
/** A pair with a Ditto in it is checked on the slower clock (breedDittoHours). */
export const slowPair = (data: GameData, a: number, b: number) => isDitto(data, a) || isDitto(data, b)

/**
 * Can these two make an Egg? In this order:
 * 1. a Ditto pairs with everyone but legendaries and mythicals (babies and another Ditto included);
 * 2. an Undiscovered one never breeds;
 * 3. a genderless one breeds only with Ditto;
 * 4. two of a male-only, or two of a female-only species can't (Pokédice has no genders: this is the closest to the
 *    games without them);
 * 5. otherwise they need an Egg group in common.
 * So a legendary never pairs with anyone.
 */
export function compatible(data: GameData, a: number, b: number): boolean {
  if (slowPair(data, a, b)) return !isLegendary(data, a) && !isLegendary(data, b)
  const ea = data.eggGroups[a]
  const eb = data.eggGroups[b]
  if (!ea || !eb) return false
  if (ea.g.includes('Undiscovered') || eb.g.includes('Undiscovered')) return false
  if (ea.s === 'N' || eb.s === 'N') return false
  if (ea.s && ea.s === eb.s) return false
  return ea.g.some((g) => eb.g.includes(g))
}

/** The Egg groups two Pokémon share, for the UI ("Field", "Dragon"). Empty for a Ditto pair: Ditto is its own reason. */
export function sharedGroups(data: GameData, a: number, b: number): string[] {
  const gb = data.eggGroups[b]?.g ?? []
  return (data.eggGroups[a]?.g ?? []).filter((g) => gb.includes(g))
}

/** Everyone at the Day Care: your Pokémon (`mine` is the slot, 0 and 1) and the visitors. */
export interface CareMember {
  /** The resident's instance id, or `owner:inst` for a visitor. */
  key: string
  dex: number
  mine: number | null
  resident?: DayCareResident
  guest?: DayCareGuest
}

export const guestKey = (g: Pick<DayCareGuest, 'owner' | 'inst'>) => `${g.owner}:${g.inst}`

export function careMembers(save: SaveData): CareMember[] {
  const dc = dayCareOf(save)
  return [
    ...dc.residents.map((r, i): CareMember => ({ key: r.inst.id, dex: r.inst.dex, mine: i, resident: r })),
    ...dc.guests.map((g): CareMember => ({ key: guestKey(g), dex: g.dex, mine: null, guest: g })),
  ]
}

export interface CarePair {
  /** Always one of yours: your Pokémon do the checking. */
  a: CareMember
  b: CareMember
  /** It has a Ditto: checked every breedDittoHours. */
  slow: boolean
}

/**
 * Every pair the checks look at: each of your Pokémon with everyone else at the Day Care (your other one and every
 * visitor), each pair once. A visitor × visitor pair never counts.
 */
export function pairs(save: SaveData, data: GameData): CarePair[] {
  const all = careMembers(save)
  const out: CarePair[] = []
  for (const a of all) {
    if (a.mine == null) continue
    for (const b of all) {
      if (b === a || (b.mine != null && b.mine < a.mine)) continue
      if (compatible(data, a.dex, b.dex)) out.push({ a, b, slow: slowPair(data, a.dex, b.dex) })
    }
  }
  return out
}

/** Who a Pokémon here pairs with, for the cards: everyone at the Day Care it is compatible with. */
export function matesOf(save: SaveData, data: GameData, key: string): CareMember[] {
  const ps = pairs(save, data)
  return ps.flatMap((p) => (p.a.key === key ? [p.b] : p.b.key === key ? [p.a] : []))
}

const parentOf = (m: CareMember): EggParent => (m.guest ? { dex: m.dex, owner: m.guest.ownerName } : { dex: m.dex })

export type Clock = 'breed' | 'ditto'
const CLOCKS: readonly Clock[] = ['breed', 'ditto']
const FIELD = { breed: 'breedAt', ditto: 'dittoAt' } as const

/** A clock's interval, in ms. */
export function clockMs(data: GameData, clock: Clock): number {
  const cfg = data.config.dayCare
  return Math.max(0.01, clock === 'breed' ? cfg.breedHours : cfg.breedDittoHours) * HOUR
}

const lastOf = (dc: DayCareState, clock: Clock) => dc[FIELD[clock]]

/** When a clock checks next: a clock that never ran starts from now. */
export const clockDueAt = (save: SaveData, data: GameData, clock: Clock, now: number) =>
  (lastOf(dayCareOf(save), clock) ?? now) + clockMs(data, clock)

const onClock = (p: CarePair, clock: Clock) => p.slow === (clock === 'ditto')

/** The clock the next Egg can come from: the sooner of those with pairs; with no pairs, the Egg-group clock. */
export function nextClock(save: SaveData, data: GameData, now: number): { clock: Clock; at: number } {
  const ps = pairs(save, data)
  const live = CLOCKS.filter((c) => ps.some((p) => onClock(p, c)))
  return (live.length ? live : (['breed'] as const))
    .map((clock) => ({ clock, at: clockDueAt(save, data, clock, now) }))
    .sort((x, y) => x.at - y.at)[0]!
}

/** When the next check that could leave an Egg runs (the widget and the Egg-now bar count down to it). */
export const nextCheckAt = (save: SaveData, data: GameData, now: number) => nextClock(save, data, now).at

/**
 * Runs both clocks up to `now`. Missed checks collapse into one (one Egg waits at a time anyway): a clock that is due
 * moves on by whole intervals, and if no Egg waits and it has pairs, a random pair of its own leaves one. The gift
 * (the free first Egg) waits as soon as the Day Care is open. Idempotent: twice at the same `now` changes nothing,
 * and the save comes back as the same object when nothing happened.
 */
export function processDayCare(save: SaveData, data: GameData, now: number, rng: Rng): { save: SaveData; laid?: true } {
  if (!isDayCareOpen(save, data)) return { save }
  let dc = dayCareOf(save)
  let changed = false
  let laid = false
  if (!dc.eggClaimed && !dc.egg) {
    dc = { ...dc, egg: { at: now, gift: true } }
    changed = true
  }
  const ps = pairs(save, data)
  // The clock that was due first runs first: it is the one that would have found the pair.
  const clocks = CLOCKS.map((clock) => ({ clock, last: lastOf(dc, clock) ?? now, step: clockMs(data, clock) })).sort(
    (x, y) => x.last + x.step - (y.last + y.step),
  )
  for (const { clock, last, step } of clocks) {
    const due = Math.floor((now - last) / step)
    const at = due >= 1 ? last + due * step : last
    if (due >= 1 && !dc.egg) {
      const mine = ps.filter((p) => onClock(p, clock))
      if (mine.length) {
        const p = rng.pick(mine)
        dc = { ...dc, egg: { at, parents: [parentOf(p.a), parentOf(p.b)] } }
        laid = true
      }
    }
    if (lastOf(dc, clock) !== at) {
      dc = { ...dc, [FIELD[clock]]: at }
      changed = true
    }
  }
  if (!changed && !laid) return { save }
  return laid ? { save: { ...save, dayCare: dc }, laid: true } : { save: { ...save, dayCare: dc } }
}

export type RushRefusal = 'egg' | 'pair' | 'gold'

/**
 * Egg now: refused when an Egg already waits, when no pair can make one, or short of `rushPrice`. Otherwise it takes
 * the ₽ and runs now the clock `nextClock` points to: that clock starts over from `now`, a random pair of its own
 * leaves the Egg, and the other clock keeps running. It buys the check early, not an extra one. The store hatches the
 * Egg at once.
 */
export function rushEgg(
  save: SaveData,
  data: GameData,
  now: number,
  rng: Rng,
): { save: SaveData } | { refused: RushRefusal } {
  const dc = dayCareOf(save)
  if (dc.egg) return { refused: 'egg' }
  const ps = pairs(save, data)
  if (!ps.length) return { refused: 'pair' }
  const price = Math.max(0, Math.round(data.config.dayCare.rushPrice))
  if (save.gold < price) return { refused: 'gold' }
  const { clock } = nextClock(save, data, now)
  const p = rng.pick(ps.filter((x) => onClock(x, clock)))
  return {
    save: {
      ...save,
      gold: save.gold - price,
      dayCare: { ...dc, [FIELD[clock]]: now, egg: { at: now, parents: [parentOf(p.a), parentOf(p.b)] } },
    },
  }
}

/** About how many Eggs a week a single compatible pair gives (the admin's summary line). */
export const eggsPerWeek = (data: GameData, clock: Clock) => (7 * 24 * HOUR) / clockMs(data, clock)
