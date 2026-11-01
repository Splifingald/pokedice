// Breeding at the Day Care (docs/15): who can make an Egg with whom (the real Egg groups, src/data/egg-groups.json),
// the pairs the checks look at, and the two clocks that lay the Eggs: every `breedHours` for pairs that share an Egg
// group, every `breedDittoHours` for pairs with a Ditto. A clock only runs while it has a pair. One Egg waits at a
// time; Egg now buys the next check early. The hatching itself is `hatchEgg` in daycare.ts.
import { dayCareOf, isDayCareOpen } from './daycare'
import { friendshipOn, queueEggReport } from './friendship'
import type { Rng } from './rng'
import { TALENT, talentOf } from './talents'
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

const parentOf = (m: CareMember): EggParent =>
  m.guest ? { dex: m.dex, owner: m.guest.ownerName, ownerId: m.guest.owner } : { dex: m.dex }

export type Clock = 'breed' | 'ditto'
const CLOCKS: readonly Clock[] = ['breed', 'ditto']
const FIELD = { breed: 'breedAt', ditto: 'dittoAt' } as const

/** A clock's interval, in ms. */
export function clockMs(data: GameData, clock: Clock): number {
  const cfg = data.config.dayCare
  return Math.max(0.01, clock === 'breed' ? cfg.breedHours : cfg.breedDittoHours) * HOUR
}

/**
 * A clock's interval for this save: Flame Body (docs/51) on one of your residents runs it `flameBody` times as fast. The
 * admin's summary (`eggsPerWeek`) reads `clockMs`, the plain one.
 */
function stepMs(save: SaveData, data: GameData, clock: Clock): number {
  const rush = dayCareOf(save).residents.some((r) => talentOf(data, r.inst) === 'flameBody')
  return clockMs(data, clock) / (rush ? TALENT.flameBody : 1)
}

const lastOf = (dc: DayCareState, clock: Clock) => dc[FIELD[clock]]

const onClock = (p: CarePair, clock: Clock) => p.slow === (clock === 'ditto')

/** The clocks that have a pair: the only ones that run. */
const runningClocks = (save: SaveData, data: GameData): Clock[] => {
  const ps = pairs(save, data)
  return CLOCKS.filter((c) => ps.some((p) => onClock(p, c)))
}

/**
 * A clock runs only while it has a pair: it starts the moment two Pokémon here can make an Egg on it, and when the
 * last of its pairs leaves it stops and forgets how far it had got, so the next pair waits a whole interval again.
 * Nothing is checked while nobody here can pair. The store runs this on every save it takes in (a Pokémon left or
 * taken back, a friend's invited or gone, an Egg hatched), so a clock starts and stops at the change itself.
 * The same object when nothing changes.
 */
export function syncEggClocks(save: SaveData, data: GameData, now: number): SaveData {
  const dc = dayCareOf(save)
  const running = runningClocks(save, data)
  let next = dc
  for (const clock of CLOCKS) {
    const on = running.includes(clock)
    const last = lastOf(dc, clock)
    if (on && last == null) next = { ...next, [FIELD[clock]]: now }
    if (!on && last != null) {
      const { [FIELD[clock]]: _stopped, ...rest } = next
      next = rest
    }
  }
  return next === dc ? save : { ...save, dayCare: next }
}

/** When a clock checks next; null while it has no pair (it isn't running). One with a pair that never ran starts now. */
export function clockDueAt(save: SaveData, data: GameData, clock: Clock, now: number): number | null {
  if (!runningClocks(save, data).includes(clock)) return null
  return (lastOf(dayCareOf(save), clock) ?? now) + stepMs(save, data, clock)
}

/** The clock the next Egg can come from: the sooner of those with pairs. Null with no pair: nothing is checked. */
export function nextClock(save: SaveData, data: GameData, now: number): { clock: Clock; at: number } | null {
  return (
    runningClocks(save, data)
      .map((clock) => ({ clock, at: (lastOf(dayCareOf(save), clock) ?? now) + stepMs(save, data, clock) }))
      .sort((x, y) => x.at - y.at)[0] ?? null
  )
}

/** When the next check that could leave an Egg runs (the widget and the Egg-now bar count down to it); null with no pair. */
export const nextCheckAt = (save: SaveData, data: GameData, now: number) => nextClock(save, data, now)?.at ?? null

/** How far that clock has run since its last check, 0 to 1: Home's gauge to the next Egg check. Null with no pair. */
export function nextCheckProgress(save: SaveData, data: GameData, now: number): { at: number; done: number } | null {
  const next = nextClock(save, data, now)
  if (!next) return null
  const step = stepMs(save, data, next.clock)
  return { at: next.at, done: Math.min(1, Math.max(0, (now - (next.at - step)) / step)) }
}

/**
 * Runs the clocks that have pairs up to `now` (the others stop: `syncEggClocks`). Missed checks collapse into one (one
 * Egg waits at a time anyway): a clock that is due moves on by whole intervals, and if no Egg waits, a random pair of
 * its own leaves one. The gift (the free first Egg) waits as soon as the Day Care is open. Idempotent: twice at the
 * same `now` changes nothing, and the save comes back as the same object when nothing happened.
 */
export function processDayCare(save: SaveData, data: GameData, now: number, rng: Rng): { save: SaveData; laid?: true } {
  if (!isDayCareOpen(save, data)) return { save }
  const synced = syncEggClocks(save, data, now)
  let dc = dayCareOf(synced)
  let changed = synced !== save
  let laid = false
  if (!dc.eggClaimed && !dc.egg) {
    dc = { ...dc, egg: { at: now, gift: true } }
    changed = true
  }
  const ps = pairs(save, data)
  // Only the running clocks (a stopped one has no last check), and the one that was due first runs first: it is the
  // one that would have found the pair.
  const clocks = CLOCKS.flatMap((clock) => {
    const last = lastOf(dc, clock)
    return last == null ? [] : [{ clock, last, step: stepMs(save, data, clock) }]
  }).sort((x, y) => x.last + x.step - (y.last + y.step))
  for (const { clock, last, step } of clocks) {
    const due = Math.floor((now - last) / step)
    if (due < 1) continue
    const at = last + due * step
    if (!dc.egg) {
      const p = rng.pick(ps.filter((x) => onClock(x, clock)))
      dc = { ...dc, egg: { at, parents: [parentOf(p.a), parentOf(p.b)] } }
      laid = true
    }
    dc = { ...dc, [FIELD[clock]]: at }
    changed = true
  }
  if (!changed) return { save }
  return laid
    ? { save: reportEggFriends({ ...save, dayCare: dc }, data, dc.egg?.parents), laid: true }
    : { save: { ...save, dayCare: dc } }
}

/** An Egg made with a friend's Pokémon keeps the friendship streak going (docs/59): the server is told later. */
function reportEggFriends(save: SaveData, data: GameData, parents: readonly EggParent[] | undefined): SaveData {
  if (!friendshipOn(data)) return save
  let out = save
  for (const p of parents ?? []) if (p.ownerId) out = queueEggReport(out, p.ownerId)
  return out
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
  // There is a pair, so a clock runs.
  const { clock } = nextClock(save, data, now)!
  const p = rng.pick(ps.filter((x) => onClock(x, clock)))
  const parents: [EggParent, EggParent] = [parentOf(p.a), parentOf(p.b)]
  return {
    save: reportEggFriends(
      { ...save, gold: save.gold - price, dayCare: { ...dc, [FIELD[clock]]: now, egg: { at: now, parents } } },
      data,
      parents,
    ),
  }
}

/** About how many Eggs a week a single compatible pair gives (the admin's summary line). */
export const eggsPerWeek = (data: GameData, clock: Clock) => (7 * 24 * HOUR) / clockMs(data, clock)
