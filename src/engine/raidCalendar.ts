// Raid Battles' calendar (the user's design, 2026-10-11): one raid a UTC day, the same for every player, laid out per
// year. Fixed dates first (Pokémon Day, Earth Day, Halloween… `raid.calendar.anchors`), then the mythicals and every
// legendary as a shiny on that year's weekends (shiny mythicals are kept for other events), the pseudo-legendaries (normal and shiny) spread over
// the year, and shiny fully evolved Pokémon of late areas on the days left. Each raid Pokémon has its area in its home
// region — a mythical's lair, a legendary's boss area, else where it lives — and a catch stays locked until that area
// is completed (engine/raid.ts).
import { isLegendary } from './breeding'
import { raidAllyAllowed } from './raidBattle'
import { regionOf, regionOfArea, regionOfSpecies } from './regions'
import { createRng } from './rng'
import type { Area, GameData, SaveData } from './types'

/** What kind of raid a day holds: a fixed date's, a mythical, a shiny legendary, a pseudo-legendary or a shiny filler. */
export type RaidKind = 'special' | 'mythical' | 'legendary' | 'pseudo' | 'filler'

export interface RaidDay {
  dex: number
  shiny: boolean
  /** Its area: the raid is fought in front of its picture, and a catch unlocks once it's completed. */
  areaId: string
  kind: RaidKind
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
    // The mythicals normal only: their shinies are for other events (the user, 2026-10-11).
    mythical: mythicals.flatMap((d) => entry(d, false, 'mythical')),
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
 * A year's raids, one per day: the anchors on their dates, the mythicals and legendaries on the weekends (then Fridays
 * when there are more of them than weekend days), the pseudo-legendaries evenly spread, the fillers on the rest. The
 * same year always gives the same calendar (its order is shuffled from the year), so every player has the same raid.
 */
export function buildRaidCalendar(data: GameData, year: number): RaidDay[] {
  const cfg = data.config.events.raid
  const days = daysOf(year)
  const slots: (RaidDay | null)[] = days.map(() => null)
  const group: ('anchor' | 'big' | 'pseudo' | 'filler' | null)[] = days.map(() => null)
  const entries = raidEntries(data)
  const all = [...entries.mythical, ...entries.legendary, ...entries.pseudo, ...entries.filler]
  let big = [...entries.mythical, ...entries.legendary]
  let pseudo = [...entries.pseudo]
  let filler = [...entries.filler]
  // The fixed dates: their raid, and it isn't laid out again that year.
  for (const a of cfg.calendar.anchors) {
    const i = days.findIndex((d) => d.md === a.date)
    if (i < 0 || slots[i] || !data.species[a.dex]) continue
    const known = all.find((e) => same(e, a))
    const area = known ? { areaId: known.areaId, kind: known.kind } : { areaId: raidHomeArea(data, a.dex)?.id, kind: 'special' as const }
    if (!area.areaId) continue
    slots[i] = { dex: a.dex, shiny: a.shiny, areaId: area.areaId, kind: area.kind }
    group[i] = 'anchor'
    big = big.filter((e) => !same(e, a))
    pseudo = pseudo.filter((e) => !same(e, a))
    filler = filler.filter((e) => !same(e, a))
  }
  const rng = createRng(year * 7919 + 17)
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
  free().forEach((d, k) => {
    const e = filler.length ? filler[k % filler.length]! : entries.legendary[k % Math.max(1, entries.legendary.length)]
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
  return slots.map((s) => s ?? { dex: 0, shiny: false, areaId: '', kind: 'filler' as const })
}

const cache = new WeakMap<GameData, Map<number, RaidDay[]>>()

/** A year's calendar, built once per content. */
export function raidCalendar(data: GameData, year: number): RaidDay[] {
  let byYear = cache.get(data)
  if (!byYear) cache.set(data, (byYear = new Map()))
  let cal = byYear.get(year)
  if (!cal) byYear.set(year, (cal = buildRaidCalendar(data, year)))
  return cal
}

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
