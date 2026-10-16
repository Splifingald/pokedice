// Small worlds (docs/21): the admin's list, normalised, and the lookups the rest of the engine needs (by id, by region,
// by area). Kept apart from engine/worlds.ts (the rules) and free of other engine imports, so the data compiler and the
// low-level rules (XP, encounters) can read it without an import cycle.
import type { Area, GameData, SmallWorld } from './types'

/** Home's preview of a world starts this many hours before it does, unless the admin says otherwise (docs/21 §9). */
export const PREVIEW_HOURS = 48
/** The longest preview the admin can set: two weeks. */
export const PREVIEW_HOURS_MAX = 14 * 24

/** A new world's settings, so the admin's editor starts from the numbers the plan settled on (×5 XP, 3 badges). */
export function newSmallWorld(id: string, regionId: string, start: string, end: string): SmallWorld {
  return {
    id,
    regionId,
    start,
    end,
    title: {},
    banner: '',
    theme: { main: '#5b3a9e', accent: '#ff6f9c', ground: '#efe6fb' },
    minBadges: 3,
    starters: [],
    xpMultiplier: 5,
    boosters: [],
    shop: [],
    mythical: { dex: 0, level: 60, areaId: '' },
    opens: {},
    previewHours: PREVIEW_HOURS,
  }
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** A world as the admin saved it, every setting filled in (a row from an older admin may miss some). */
export function normaliseWorld(raw: Partial<SmallWorld>): SmallWorld {
  const d = newSmallWorld(String(raw.id ?? ''), String(raw.regionId ?? ''), String(raw.start ?? ''), String(raw.end ?? ''))
  return {
    ...d,
    ...raw,
    title: { ...raw.title },
    theme: { ...d.theme, ...raw.theme },
    minBadges: Math.max(0, Math.floor(num(raw.minBadges, d.minBadges))),
    starters: Array.isArray(raw.starters) ? raw.starters.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
    xpMultiplier: Math.max(0, num(raw.xpMultiplier, d.xpMultiplier)),
    boosters: Array.isArray(raw.boosters) ? raw.boosters.filter((b) => !!b?.type) : [],
    shop: Array.isArray(raw.shop) ? raw.shop.filter((r) => !!r?.key) : [],
    mythical: { ...d.mythical, ...raw.mythical },
    opens: { ...raw.opens },
    // A row saved before the preview existed gets the default; whole hours, never negative, two weeks at most.
    previewHours: Math.min(PREVIEW_HOURS_MAX, Math.max(0, Math.floor(num(raw.previewHours, d.previewHours)))),
  } as SmallWorld
}

const LISTS = new WeakMap<object, SmallWorld[]>()

/** The admin's small worlds, past, running and to come. */
export function smallWorlds(data: Pick<GameData, 'config'>): SmallWorld[] {
  const raw = data.config.smallWorlds?.list ?? []
  let list = LISTS.get(raw)
  if (!list) LISTS.set(raw, (list = raw.map((w) => normaliseWorld(w))))
  return list
}

export const worldById = (data: Pick<GameData, 'config'>, id: string | null | undefined): SmallWorld | null =>
  (id && smallWorlds(data).find((w) => w.id === id)) || null

/** The world whose region this is (the admin gives each world a region of its own). */
export const worldOfRegion = (data: Pick<GameData, 'config'>, regionId: string): SmallWorld | null =>
  smallWorlds(data).find((w) => w.regionId === regionId) ?? null

/** The world an area belongs to, if it's a small world's. */
export const worldOfArea = (data: Pick<GameData, 'config'>, area: Pick<Area, 'regionId'> | undefined): SmallWorld | null =>
  area ? worldOfRegion(data, area.regionId ?? 'kanto') : null

/** This boss is a small world's shiny mythical, in its own area: the one legendary that is never shiny-locked. */
export const isWorldMythical = (data: Pick<GameData, 'config'>, areaId: string, dex: number): boolean =>
  smallWorlds(data).some((w) => w.mythical.areaId === areaId && w.mythical.dex === dex)

/** When this area of a small world opens (ms, UTC), if it waits for a date. */
export function areaOpensAt(data: Pick<GameData, 'config' | 'areas'>, areaId: string): number | null {
  const area = data.areas.find((a) => a.id === areaId)
  const iso = worldOfArea(data, area)?.opens[areaId]
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : null
}

/**
 * The area's date has come, on the server's clock (no date: always; time unknown: not yet). On top of the usual rule
 * (`isAreaUnlocked`: the one before cleared), which stays clock-free.
 */
export function areaOpenAt(data: Pick<GameData, 'config' | 'areas'>, areaId: string, now: number | null): boolean {
  const t = areaOpensAt(data, areaId)
  return t == null || (now != null && now >= t)
}
