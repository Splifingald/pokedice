// Extreme mode (docs/22-EXTREME-MODE-PLAN.md): a second save, opened by a league of the main one, with no Pokémon
// Centers, K.O.s that rest for hours, and healing only while the player is out of the game. Every rule and number of
// it is decided here; the screens only show them.
import { eventOpenTo } from './events'
import { instanceMaxHp } from './progression'
import { getRegion, leagueDone } from './regions'
import type { DayCareState, ExtremeConfig, GameData, PokemonInstance, RegionSave, SaveData } from './types'

export const HOUR_MS = 3_600_000

export const isExtreme = (save: Pick<SaveData, 'mode'> | null | undefined): boolean => save?.mode === 'extreme'

const cfg = (data: GameData): ExtremeConfig => data.config.extreme

/** Pokémon Centers are dealt, sent and heal as in the main game. */
export const centersOn = (save: Pick<SaveData, 'mode'>, data: GameData): boolean => !isExtreme(save) || cfg(data).centers

/** A lost round (or a lost Rebattle tier) heals the team, as in the main game. */
export const wipeHeals = (save: Pick<SaveData, 'mode'>, data: GameData): boolean => !isExtreme(save) || cfg(data).wipeHeals

/** Potions and Revives work. */
export const healItemsOn = (save: Pick<SaveData, 'mode'>, data: GameData): boolean => !isExtreme(save) || cfg(data).items

// ---------------------------------------------------------------- opening it

/**
 * The admin has switched Extreme mode on for whoever is playing (as for the events: off, on for the admin alone, on
 * for everyone; off by default). Off, it's nowhere: no pop-up, no title card, no menu row. Extreme saves are kept.
 */
export const extremeOn = (data: GameData): boolean => eventOpenTo(cfg(data).access, data)

/** The main save has beaten the league that opens Extreme mode. */
export function extremeLeagueDone(save: SaveData, data: GameData): boolean {
  return !isExtreme(save) && !!getRegion(data, cfg(data).unlockRegion) && leagueDone(save, data, cfg(data).unlockRegion)
}

/**
 * The main save, stamped the first time its unlock league is seen done: Extreme mode then stays open, even if the
 * admin later switches that region off or picks another one. The same save when there is nothing to stamp.
 */
export function stampExtremeUnlock(save: SaveData, data: GameData, now: number): SaveData {
  if (isExtreme(save) || save.extremeUnlockedAt != null || !extremeLeagueDone(save, data)) return save
  return { ...save, extremeUnlockedAt: now }
}

/** Extreme mode can be played from this main save. */
export function extremeOpen(save: SaveData | null, data: GameData): boolean {
  if (!save || isExtreme(save) || !extremeOn(data)) return false
  return save.extremeUnlockedAt != null || extremeLeagueDone(save, data)
}

/** The rules pop-up opens by itself (once): Extreme mode just opened. */
export function extremeRulesDue(save: SaveData | null, data: GameData): boolean {
  return !!save && extremeOpen(save, data) && !save.extremeRulesSeen
}

/** The numbers the rules pop-up and the admin panel show. */
export function extremeRules(data: GameData) {
  const c = cfg(data)
  const pct = Math.max(0, c.awayHealPctPerHour)
  return {
    koHours: c.koHours,
    koHp: c.koReviveHp,
    awayPct: pct,
    centers: c.centers,
    items: c.items,
    /** Hours away for a Pokémon to go from `koHp` to full, in the best case (null when nothing heals). */
    fullHours: pct > 0 ? Math.ceil(100 / pct) : null,
  }
}

// ---------------------------------------------------------------- every Pokémon a save owns

type InstanceFn = (inst: PokemonInstance) => PokemonInstance

/**
 * `fn` over every Pokémon the save owns, wherever it is: the live Box, each parked region's Box and the Day Care. The
 * same objects come back where nothing changed, so `changed` can be told by identity.
 */
function mapEveryInstance(save: SaveData, fn: InstanceFn): SaveData {
  let changed = false
  const mapBox = (box: PokemonInstance[]) => {
    let any = false
    const out = box.map((p) => {
      const next = fn(p)
      if (next !== p) any = true
      return next
    })
    if (any) changed = true
    return any ? out : box
  }
  const box = mapBox(save.box)
  let parked = save.parked
  if (parked) {
    const next: Partial<Record<string, RegionSave>> = {}
    let any = false
    for (const [id, block] of Object.entries(parked)) {
      if (!block) continue
      const b = mapBox(block.box)
      next[id] = b === block.box ? block : { ...block, box: b }
      if (b !== block.box) any = true
    }
    if (any) parked = next
  }
  let dayCare: DayCareState | undefined = save.dayCare
  if (dayCare?.residents.length) {
    let any = false
    const residents = dayCare.residents.map((r) => {
      const inst = fn(r.inst)
      if (inst === r.inst) return r
      any = true
      return { ...r, inst }
    })
    if (any) {
      changed = true
      dayCare = { ...dayCare, residents }
    }
  }
  return changed ? { ...save, box, parked, dayCare } : save
}

function* everyInstance(save: SaveData): Generator<PokemonInstance> {
  yield* save.box
  for (const block of Object.values(save.parked ?? {})) if (block) yield* block.box
  for (const r of save.dayCare?.residents ?? []) yield r.inst
}

// ---------------------------------------------------------------- K.O. lasts hours

const koMs = (data: GameData) => Math.max(0, cfg(data).koHours) * HOUR_MS
const reviveHp = (inst: PokemonInstance, data: GameData) =>
  Math.max(1, Math.min(instanceMaxHp(inst, data), Math.round(cfg(data).koReviveHp)))

/** When a resting Pokémon comes back (ms), or null when it isn't resting. */
export function koEndsAt(inst: Pick<PokemonInstance, 'koAt'>, data: GameData): number | null {
  return inst.koAt == null ? null : inst.koAt + koMs(data)
}

/** Time left before it comes back (ms, never below 0), or null when it isn't resting. */
export function koLeft(inst: Pick<PokemonInstance, 'koAt'>, now: number, data: GameData): number | null {
  const end = koEndsAt(inst, data)
  return end == null ? null : Math.max(0, end - now)
}

/** The resting Pokémon that comes back first, and when; null when nobody rests. */
export function firstComeback(save: SaveData, data: GameData): { inst: PokemonInstance; at: number } | null {
  let best: { inst: PokemonInstance; at: number } | null = null
  for (const inst of everyInstance(save)) {
    const at = koEndsAt(inst, data)
    if (at != null && (!best || at < best.at)) best = { inst, at }
  }
  return best
}

export interface KoSettled {
  save: SaveData
  /** Ids of the Pokémon whose rest just ended. */
  back: string[]
}

/**
 * Keeps every K.O. clock of an Extreme save right: a Pokémon at 0 HP starts resting at `now`, one above 0 (a Revive)
 * stops, and one whose rest is over comes back at `koReviveHp`. `now` is the real time, or null while it's unknown:
 * then nothing moves, so the device's clock can neither start nor end a rest. While an absence is open or waiting to
 * heal, rests don't end here: `awayHeal` ends those that end within it, at the right moment, and heals from there.
 * A main save comes back as it is.
 */
export function settleKo(save: SaveData, data: GameData, now: number | null): KoSettled {
  if (!isExtreme(save) || now == null) return { save, back: [] }
  const away = save.extreme?.awayFrom != null || !!save.extreme?.pending?.length
  const back: string[] = []
  const next = mapEveryInstance(save, (p) => {
    if (p.revivesAt != null) return p
    if (p.currentHp > 0) {
      if (p.koAt == null) return p
      const { koAt: _k, ...rest } = p
      return rest
    }
    if (p.koAt == null) return { ...p, koAt: now }
    if (away || now < p.koAt + koMs(data)) return p
    back.push(p.id)
    const { koAt: _k, ...rest } = p
    return { ...rest, currentHp: reviveHp(p, data) }
  })
  return { save: next, back }
}

// ---------------------------------------------------------------- healing while away

export interface AwayHeal {
  id: string
  dex: number
  /** HP before and after the absence. */
  from: number
  to: number
  max: number
  /** Its rest ended during the absence. */
  back: boolean
  /** Still resting when the player came back. */
  resting: boolean
}

export interface AwayResult {
  save: SaveData
  /** Minutes of absence that counted. */
  minutes: number
  /** Every Pokémon the absence changed, plus those still resting (the card lists them). */
  changes: AwayHeal[]
}

/**
 * Time spent out of the game heals an Extreme save: every Pokémon above 0 HP gets `awayHealPctPerHour` of its max HP
 * per hour, to the minute, rounded down, never above max. One whose rest ended during an absence comes back at
 * `koReviveHp` then heals for the rest of it. Absences under `awayMinMinutes` don't count. `windows` are [from, to]
 * pairs (ms, server time), oldest first.
 */
export function awayHeal(save: SaveData, data: GameData, windows: readonly (readonly [number, number])[]): AwayResult {
  const c = cfg(data)
  const minMs = Math.max(0, c.awayMinMinutes) * 60_000
  const counted = windows.filter(([from, to]) => to - from >= minMs && to > from)
  const minutes = Math.floor(counted.reduce((sum, [from, to]) => sum + (to - from), 0) / 60_000)
  if (!isExtreme(save) || !counted.length) return { save, minutes: 0, changes: [] }
  const pct = Math.max(0, c.awayHealPctPerHour) / 100
  const changes: AwayHeal[] = []
  const next = mapEveryInstance(save, (p) => {
    if (p.revivesAt != null) return p
    const max = instanceMaxHp(p, data)
    let hp = p.currentHp
    let koAt = p.koAt
    let back = false
    for (const [from, to] of counted) {
      let start = from
      if (hp <= 0) {
        if (koAt == null) continue
        const end = koAt + koMs(data)
        if (end > to) continue
        hp = reviveHp(p, data)
        koAt = undefined
        back = true
        start = Math.max(from, end)
      }
      hp = Math.min(max, hp + Math.floor((max * pct * (to - start)) / HOUR_MS))
    }
    const resting = hp <= 0 && koAt != null
    if (hp === p.currentHp && koAt === p.koAt) {
      if (resting) changes.push({ id: p.id, dex: p.dex, from: hp, to: hp, max, back: false, resting })
      return p
    }
    changes.push({ id: p.id, dex: p.dex, from: p.currentHp, to: hp, max, back, resting })
    const { koAt: _k, ...rest } = p
    return koAt == null ? { ...rest, currentHp: hp } : { ...rest, koAt, currentHp: hp }
  })
  return { save: next, minutes, changes }
}

/** The absence that just ended, added to what's waiting to heal (at most the last 20). */
export function addAwayWindow(save: SaveData, from: number, to: number): SaveData {
  const pending = [...(save.extreme?.pending ?? []), [from, to] as [number, number]].slice(-20)
  return { ...save, extreme: { ...save.extreme, awayFrom: undefined, pending } }
}
