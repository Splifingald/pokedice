// Raid Battles' calendar (the user's design, 2026-10-11): one raid a UTC day, the same for every player, laid out per
// year. Fixed dates first (Pokémon Day, Earth Day, Halloween… `raid.calendar.anchors`), then every mythical and every
// legendary as a shiny on that year's weekends (their normal forms are their areas' bosses and progression raids,
// docs/24), the pseudo-legendaries (normal and shiny) spread over the year, and shiny fully evolved Pokémon of late
// areas on the days left. Each raid Pokémon has its area in its home region — a mythical's lair, a legendary's boss
// area, else where it lives — and a catch stays locked until that area is completed (engine/raid.ts).
import { isLegendary } from './breeding'
import { portalRaidRules } from './portalMode'
import { raidAllyAllowed } from './raidBattle'
import { regionOf, regionOfArea, regionOfSpecies } from './regions'
import { createRng } from './rng'
import type { Area, GameData, RaidMonRules, SaveData } from './types'
import { worldOfArea } from './worldList'

/** What kind of raid a day holds: a fixed date's, a mythical, a shiny legendary, a pseudo-legendary or a shiny filler. */
export type RaidKind = 'special' | 'mythical' | 'legendary' | 'pseudo' | 'filler'

export interface RaidDay {
  dex: number
  shiny: boolean
  /** Its area: the raid is fought in front of its picture, and a catch unlocks once it's completed. */
  areaId: string
  kind: RaidKind
  /** Set by hand in the admin (not the plan's). */
  manual?: true
}

/** The numbers a raid Pokémon's own rules can change. */
export const RAID_MON_KEYS = ['bars', 'barHp', 'level', 'upgradeLevel'] as const
export type RaidRules = Required<RaidMonRules>

/** Which raid: the day's (the calendar) or a progression raid in an area (docs/24). */
export type RaidKindOf = 'daily' | 'progress'

/**
 * A raid Pokémon's numbers: its own (Admin → Raids → Raid Pokémon) over the defaults. A progression raid reads its own
 * list (`raid.progress.perMon`), never the day's raid's.
 */
export function raidRules(data: GameData, dex: number, kind: RaidKindOf = 'daily', areaId?: string): RaidRules {
  const cfg = data.config.events.raid
  const own = (kind === 'progress' ? cfg.progress?.perMon?.[dex] : cfg.perMon?.[dex]) ?? {}
  const pick = (k: keyof RaidMonRules) => {
    const v = Number(own[k])
    return own[k] != null && Number.isFinite(v) ? v : (cfg[k] as number)
  }
  // A portal area's raid (docs/28: Distortion World's Giratina) has its own numbers, set on the area.
  const portal = kind === 'progress' ? portalRaidRules(data, areaId) : null
  if (portal)
    return { bars: portal.bars, barHp: Math.max(0.1, pick('barHp') ?? 1), level: portal.level, upgradeLevel: portal.upgradeLevel }
  const level = (kind === 'progress' && worldRaidLevel(data, dex, areaId)) || pick('level')
  return {
    bars: Math.max(1, Math.round(pick('bars'))),
    barHp: Math.max(0.1, pick('barHp') ?? 1),
    level: Math.max(1, Math.min(100, Math.round(level))),
    upgradeLevel: Math.max(1, Math.min(10, Math.round(pick('upgradeLevel')))),
  }
}

/**
 * A small world's progression raid fights at its boss's own level, and the teams are capped there (docs/26 §2.5): its
 * Giratina is Lv.70 without moving Sinnoh's. Null for any other raid (the admin's numbers decide).
 */
export function worldRaidLevel(data: GameData, dex: number, areaId: string | undefined): number | null {
  const area = areaId ? data.areas.find((a) => a.id === areaId) : undefined
  if (!area || !worldOfArea(data, area)) return null
  const boss = area.legendaryBoss?.find((b) => b.dex === dex)
  return boss && boss.level > 0 ? boss.level : null
}

/** The sides' level cap: the day's raid's, or a progression raid's (a world's at its level, its own, the default). */
export function raidTeamCap(data: GameData, dex: number, kind: RaidKindOf = 'daily', areaId?: string): number {
  const cfg = data.config.events.raid
  if (kind === 'daily') return cfg.teamCap
  const portal = portalRaidRules(data, areaId)
  if (portal) return portal.teamCap
  const world = worldRaidLevel(data, dex, areaId)
  if (world) return Math.max(1, Math.min(100, Math.round(world)))
  const own = Number(cfg.progress?.perMon?.[dex]?.teamCap)
  const cap = Number.isFinite(own) && own > 0 ? own : (cfg.progress?.teamCap ?? cfg.teamCap)
  return Math.max(1, Math.min(100, Math.round(cap)))
}

/** A species' earlier stages (Dratini → Dragonair for Dragonite), nearest first. */
function preEvolutions(data: GameData, dex: number): number[] {
  const out: number[] = []
  let cur = dex
  for (let guard = 0; guard < 4; guard++) {
    const prev = data.speciesList.find((s) => !s.form && s.evolutions.some((e) => e.toDex === cur))
    if (!prev) break
    out.push(prev.dex)
    cur = prev.dex
  }
  return out
}

const byOrder = (a: Area, b: Area) => a.orderIndex - b.orderIndex

/**
 * A raid Pokémon's area, in its home region when it can: a mythical's lair (the config's), a legendary's boss area,
 * the roamers' (the latest of the legendaries that wake them), where it lives in the wild — or where an earlier stage
 * does, nearest stage first — and at worst its region's League.
 */
export function raidHomeArea(data: GameData, dex: number): Area | null {
  const find = (id: string) => data.areas.find((a) => a.id === id) ?? null
  const lair = data.config.events.raid.pool.find((p) => p.dex === dex)
  if (lair) return find(lair.areaId)
  const home = regionOfSpecies(data, dex)
  const inHome = (xs: Area[]) => xs.filter((a) => regionOfArea(a) === home).sort(byOrder)[0] ?? xs.sort(byOrder)[0] ?? null
  const bossOf = (d: number) => inHome(data.areas.filter((a) => (a.legendaryBoss ?? []).some((b) => b.dex === d)))
  const wildOf = (d: number) =>
    data.areas.filter((a) => regionOfArea(a) === home && a.wildPool.some((w) => w.dex === d && w.weight > 0)).sort(byOrder)[0] ?? null
  const roamers = data.config.roamers
  if (roamers?.dex.includes(dex)) {
    const woken = roamers.requires.map(bossOf).filter((a): a is Area => !!a).sort(byOrder)
    if (woken.length) return woken[woken.length - 1]!
  }
  for (const d of [dex, ...preEvolutions(data, dex)]) {
    const lairOf = data.config.events.raid.pool.find((p) => p.dex === d)
    const area = (lairOf && find(lairOf.areaId)) || bossOf(d) || wildOf(d)
    if (area) return area
  }
  const league = data.regions.find((r) => r.id === home)?.leagueAreaId
  return league ? find(league) : null
}

/** Every raid of a year, by kind, before it's laid out: each appears once a year. */
export function raidEntries(data: GameData): Record<Exclude<RaidKind, 'special'>, RaidDay[]> {
  const cfg = data.config.events.raid
  const entry = (dex: number, shiny: boolean, kind: RaidKind): RaidDay[] => {
    const area = raidHomeArea(data, dex)
    return area && data.species[dex] ? [{ dex, shiny, areaId: area.id, kind }] : []
  }
  const final = (dex: number) => !!data.species[dex] && !data.species[dex]!.form && data.species[dex]!.evolutions.length === 0
  const mythicals = [...new Set(cfg.pool.map((p) => p.dex))].sort((a, b) => a - b)
  const myth = new Set(mythicals)
  const legendaries = data.speciesList.filter((s) => !s.form && isLegendary(data, s.dex) && !myth.has(s.dex) && final(s.dex)).map((s) => s.dex)
  const pseudos = [...new Set(cfg.exclude.pseudo)].filter(final).sort((a, b) => a - b)
  const allowed = raidAllyAllowed(data)
  // Fillers: fully evolved, allowed beside a raid, living in the wild themselves in a late area of their region.
  const fillers = data.speciesList
    .filter((s) => allowed(s.dex))
    .flatMap((s) => {
      const area = raidHomeArea(data, s.dex)
      const wild = area?.wildPool.some((w) => w.dex === s.dex && w.weight > 0)
      return area && wild && area.minLevel >= cfg.calendar.fillerMinLevel ? [{ dex: s.dex, shiny: true, areaId: area.id, kind: 'filler' as const }] : []
    })
  return {
    // Shiny: a mythical's normal form is its lair's boss, never shiny there (the user, 2026-10-12).
    mythical: mythicals.flatMap((d) => entry(d, true, 'mythical')),
    legendary: legendaries.flatMap((d) => entry(d, true, 'legendary')),
    pseudo: pseudos.flatMap((d) => [...entry(d, false, 'pseudo'), ...entry(d, true, 'pseudo')]),
    filler: fillers,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
/** The UTC days of a year, 'YYYY-MM-DD', with their weekday (0 = Sunday). */
function daysOf(year: number): { day: string; md: string; weekday: number }[] {
  const out: { day: string; md: string; weekday: number }[] = []
  for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += 86_400_000) {
    const d = new Date(t)
    const md = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    out.push({ day: `${year}-${md}`, md, weekday: d.getUTCDay() })
  }
  return out
}

const same = (a: Pick<RaidDay, 'dex' | 'shiny'>, b: Pick<RaidDay, 'dex' | 'shiny'>) => a.dex === b.dex && a.shiny === b.shiny
/**
 * A day that takes an entry's place: the same raid, or, for a mythical (one day a year), any day of it, shiny or not.
 * So a fixed date still non-shiny from before docs/24 (a database 0045 hasn't reached) lays the year out exactly as a
 * shiny one: only that day's colours differ.
 */
const claims = (e: RaidDay, x: Pick<RaidDay, 'dex' | 'shiny'>) => same(e, x) || (e.kind === 'mythical' && e.dex === x.dex)

/** The seed in force on a day ('YYYY-MM-DD'): the last one whose `from` is on or before it, else 0. */
export function raidSeedOn(data: GameData, day: string): number {
  let seed = 0
  for (const s of [...(data.config.events.raid.calendar.seeds ?? [])].sort((a, b) => a.from.localeCompare(b.from))) if (s.from <= day) seed = s.seed
  return seed
}

/**
 * A year's plan, one raid per day: the anchors on their dates, the mythicals and legendaries on the weekends (then
 * Fridays when there are more of them than weekend days), the pseudo-legendaries evenly spread, the fillers on the rest.
 * Its order is shuffled from the year and the seed, so every player has the same raid. When the seed changes during
 * the year, the days before the change keep their raids and the rest of the year is laid out again from what's left.
 */
export function buildRaidCalendar(data: GameData, year: number): RaidDay[] {
  const days = daysOf(year)
  let slots: (RaidDay | null)[] = layoutYear(data, year, raidSeedOn(data, days[0]!.day), days.map(() => null))
  const changes = [...(data.config.events.raid.calendar.seeds ?? [])]
    .filter((s) => s.from > days[0]!.day && s.from.startsWith(`${year}-`))
    .sort((a, b) => a.from.localeCompare(b.from))
  for (const c of changes) {
    const at = days.findIndex((d) => d.day >= c.from)
    if (at < 0) continue
    slots = layoutYear(data, year, c.seed, slots.map((s, i) => (i < at ? s : null)))
  }
  return slots.map((s) => s ?? { dex: 0, shiny: false, areaId: '', kind: 'filler' as const })
}

/** Lays a year out from a seed around the days already `kept` (they stay, and their raids aren't used again). */
function layoutYear(data: GameData, year: number, seed: number, kept: (RaidDay | null)[]): (RaidDay | null)[] {
  const cfg = data.config.events.raid
  const days = daysOf(year)
  const slots: (RaidDay | null)[] = [...kept]
  const group: ('anchor' | 'big' | 'pseudo' | 'filler' | null)[] = kept.map((k) => (k ? 'anchor' : null))
  const entries = raidEntries(data)
  const all = [...entries.mythical, ...entries.legendary, ...entries.pseudo, ...entries.filler]
  const used = (e: RaidDay) => kept.some((k) => k && claims(e, k))
  let big = [...entries.mythical, ...entries.legendary].filter((e) => !used(e))
  let pseudo = entries.pseudo.filter((e) => !used(e))
  let filler = entries.filler.filter((e) => !used(e))
  // The fixed dates: their raid, and it isn't laid out again that year.
  for (const a of cfg.calendar.anchors) {
    const i = days.findIndex((d) => d.md === a.date)
    if (i < 0 || slots[i] || !data.species[a.dex]) continue
    const known = all.find((e) => claims(e, a))
    const area = known ? { areaId: known.areaId, kind: known.kind } : { areaId: raidHomeArea(data, a.dex)?.id, kind: 'special' as const }
    if (!area.areaId) continue
    slots[i] = { dex: a.dex, shiny: a.shiny, areaId: area.areaId, kind: area.kind }
    group[i] = 'anchor'
    big = big.filter((e) => !claims(e, a))
    pseudo = pseudo.filter((e) => !claims(e, a))
    filler = filler.filter((e) => !claims(e, a))
  }
  // Seed 0 is the calendar as it was first laid out.
  const rng = createRng(year * 7919 + 17 + seed * 104_729)
  const shuffle = <T,>(xs: T[]) => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(0, i)
      ;[a[i], a[j]] = [a[j]!, a[i]!]
    }
    return a
  }
  big = shuffle(big)
  pseudo = shuffle(pseudo)
  filler = shuffle(filler)
  const free = () => days.flatMap((d, i) => (slots[i] ? [] : [{ ...d, i }]))
  // Mythicals and legendaries: weekends, then Fridays, then any day.
  const rank = (w: number) => (w === 0 || w === 6 ? 0 : w === 5 ? 1 : 2)
  for (const d of free().sort((x, y) => rank(x.weekday) - rank(y.weekday) || x.i - y.i)) {
    const e = big.shift()
    if (!e) break
    slots[d.i] = e
    group[d.i] = 'big'
  }
  // Pseudo-legendaries: evenly over the days left.
  const left = free()
  pseudo.forEach((e, k) => {
    const d = left[Math.floor(((k + 0.5) * left.length) / pseudo.length)]
    if (d && !slots[d.i]) {
      slots[d.i] = e
      group[d.i] = 'pseudo'
    }
  })
  // The fillers on the rest, round again if there are more days than fillers.
  const pool = filler.length ? filler : entries.filler.length ? entries.filler : entries.legendary
  free().forEach((d, k) => {
    const e = pool[k % Math.max(1, pool.length)]
    if (e) {
      slots[d.i] = e
      group[d.i] = 'filler'
    }
  })
  // Never the same species two days running: swap with a later day of the same group.
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1]
    const cur = slots[i]
    if (!prev || !cur || prev.dex !== cur.dex || group[i] === 'anchor') continue
    for (let j = i + 1; j < slots.length; j++) {
      const c = slots[j]
      if (group[j] !== group[i] || !c || c.dex === prev.dex || c.dex === slots[i + 1]?.dex) continue
      if (slots[j - 1]?.dex === cur.dex || slots[j + 1]?.dex === cur.dex) continue
      ;[slots[i], slots[j]] = [c, cur]
      break
    }
  }
  return slots
}

const cache = new WeakMap<object, Map<number, { plan: RaidDay[]; cal: RaidDay[] }>>()

/** A year's plan and its calendar (the plan with the days set by hand), built once per raid config. */
function yearOf(data: GameData, year: number): { plan: RaidDay[]; cal: RaidDay[] } {
  const key = data.config.events.raid
  let byYear = cache.get(key)
  if (!byYear) cache.set(key, (byYear = new Map()))
  let got = byYear.get(year)
  if (!got) {
    const plan = buildRaidCalendar(data, year)
    const overrides = data.config.events.raid.calendar.overrides ?? {}
    const entries = raidEntries(data)
    const all = [...entries.mythical, ...entries.legendary, ...entries.pseudo, ...entries.filler]
    const days = daysOf(year)
    const cal = plan.map((r, i) => {
      const o = overrides[days[i]!.day]
      if (!o || !data.species[o.dex]) return r
      const known = all.find((e) => claims(e, { dex: o.dex, shiny: !!o.shiny }))
      const areaId = known?.areaId ?? raidHomeArea(data, o.dex)?.id
      return areaId ? { dex: o.dex, shiny: !!o.shiny, areaId, kind: known?.kind ?? ('special' as const), manual: true as const } : r
    })
    byYear.set(year, (got = { plan, cal }))
  }
  return got
}

/** A year's calendar: the plan, with the days set by hand. */
export const raidCalendar = (data: GameData, year: number): RaidDay[] => yearOf(data, year).cal

/** The day's position in its year (0-based) and the year, from 'YYYY-MM-DD'. */
function indexOf(day: string): { year: number; i: number } {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return { year: y, i: Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) }
}

/** The raid of a UTC day ('YYYY-MM-DD'). */
export function raidOfDay(data: GameData, day: string): RaidDay | null {
  const { year, i } = indexOf(day)
  const r = raidCalendar(data, year)[i]
  return r && r.dex ? r : null
}

/** What the plan gives a day, whatever was set by hand (the admin shows both). */
export function raidPlanOf(data: GameData, day: string): RaidDay | null {
  const { year, i } = indexOf(day)
  const r = yearOf(data, year).plan[i]
  return r && r.dex ? r : null
}

/** The raids of the `n` days after `day`. */
export function upcomingRaids(data: GameData, day: string, n: number): { day: string; raid: RaidDay }[] {
  const out: { day: string; raid: RaidDay }[] = []
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  for (let k = 1; out.length < n && k <= n + 2; k++) {
    const t = new Date(Date.UTC(y, m - 1, d + k))
    const next = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
    const raid = raidOfDay(data, next)
    if (raid) out.push({ day: next, raid })
  }
  return out
}

/** The next days (from `day` on, this year and next) a species is the raid, normal or shiny. */
export function nextRaidsOf(data: GameData, dex: number, day: string, limit = 2): { day: string; shiny: boolean }[] {
  const { year, i } = indexOf(day)
  const out: { day: string; shiny: boolean }[] = []
  for (const y of [year, year + 1]) {
    const days = daysOf(y)
    raidCalendar(data, y).forEach((r, k) => {
      if (out.length < limit && r.dex === dex && (y > year || k >= i)) out.push({ day: days[k]!.day, shiny: r.shiny })
    })
  }
  return out
}

/** The region a raid Pokémon belongs to: its area's. */
export function raidRegion(data: GameData, areaId: string): string {
  const area = data.areas.find((a) => a.id === areaId)
  return area ? regionOfArea(area) : (data.regions[0]?.id ?? 'kanto')
}

/** Whether the player has that region going (live or parked). */
export const regionStarted = (save: SaveData, region: string): boolean => regionOf(save) === region || !!save.parked?.[region]
