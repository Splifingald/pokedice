// Extreme mode as a speedrun (docs/48): one run per region, from its starter to its League, on a timer that runs on the
// real clock, game open or closed. A region's run opens once the main save has beaten that region's League; a run can
// be restarted from zero to beat its best time. Every rule is decided here; the Extreme page only shows them.
import { isExtreme, extremeOn } from './extreme'
import { createInstance } from './progression'
import {
  enabledRegions,
  getRegion,
  isWorldRegion,
  leagueDone,
  newRegionBlock,
  regionOf,
  startRegion,
  switchRegion,
} from './regions'
import { newSave } from './run'
import type { ExtremeRun, GameData, PlayerProfile, Region, RegionId, SaveData } from './types'

/** The regions whose run can be played: the main save has beaten their League (and Extreme mode is on). */
export function extremeRegions(main: SaveData | null, data: GameData): Region[] {
  if (!main || isExtreme(main) || !extremeOn(data)) return []
  return enabledRegions(data).filter((r) => !isWorldRegion(data, r.id) && leagueDone(main, data, r.id))
}

/** Every region a run could one day be played in, in order (the page shows the locked ones too). */
export const extremeRegionList = (data: GameData): Region[] =>
  enabledRegions(data).filter((r) => !isWorldRegion(data, r.id))

/** This region's run, or null when it was never started. */
export const runOf = (save: SaveData | null, region: RegionId): ExtremeRun | null =>
  (save && isExtreme(save) && save.extreme?.runs?.[region]) || null

/** The run's time so far (ms): from its start to its League, or to now while it's on. */
export const runTime = (run: Pick<ExtremeRun, 'startedAt' | 'finishedAt'>, now: number): number =>
  Math.max(0, (run.finishedAt ?? now) - run.startedAt)

/** Where a region's run stands. */
export function runState(save: SaveData | null, region: RegionId): 'none' | 'running' | 'won' {
  const run = runOf(save, region)
  return !run ? 'none' : run.finishedAt != null ? 'won' : 'running'
}

/** The region's run is in the save (its Box and its progress), live or parked. */
const hasBlock = (save: SaveData, region: RegionId) => regionOf(save) === region || !!save.parked?.[region]

/**
 * Starts a region's run from zero on the chosen starter, and plays it: a new Extreme save when there is none yet (the
 * player's name and look from the main save), else that region's block replaced by a fresh one, the others kept. The
 * timer starts at `now`; the best time stays.
 */
export function beginRun(
  save: SaveData | null,
  data: GameData,
  regionId: RegionId,
  starterDex: number,
  now: number,
  newId: () => string,
  player?: PlayerProfile,
): SaveData | null {
  const region = getRegion(data, regionId)
  if (!region || !data.species[starterDex]) return null
  const block = newRegionBlock(region, starterDex, data, now, newId, createInstance)
  let next: SaveData
  if (save && isExtreme(save)) next = startRegion(save, region, block)
  else {
    // A first run: a new save holding this region alone (newSave starts in the first region; that block goes).
    const base: SaveData = { ...newSave(starterDex, data, now, newId, player), mode: 'extreme' }
    next = startRegion(base, region, block)
    if (regionOf(base) !== regionId) {
      const { [regionOf(base)]: _first, ...parked } = next.parked ?? {}
      next = { ...next, parked }
    }
  }
  const best = runOf(save, regionId)?.best
  const run: ExtremeRun = { id: newId(), startedAt: now, ...(best != null && { best }) }
  // A Center's boons still waiting were the old run's.
  const { center: _c, ...extreme } = next.extreme ?? {}
  return { ...next, extreme: { ...extreme, runs: { ...extreme.runs, [regionId]: run } } }
}

/** Plays a region's run already started (its block becomes the live one). The same save when it's live already. */
export function openRun(save: SaveData, regionId: RegionId): SaveData | null {
  if (!isExtreme(save) || !hasBlock(save, regionId)) return null
  return regionOf(save) === regionId ? save : switchRegion(save, regionId)
}

/**
 * Keeps every run right, on the real time (`now` null while it's unknown: nothing moves): a run whose League is won
 * stops its timer and keeps its best time; a region played from before the runs (an Extreme save from before docs/48)
 * gets its run, its timer starting now. The same save when nothing changes.
 */
export function settleRuns(save: SaveData, data: GameData, now: number | null): SaveData {
  if (!isExtreme(save) || now == null) return save
  const runs = { ...save.extreme?.runs }
  let changed = false
  for (const region of [regionOf(save), ...Object.keys(save.parked ?? {})]) {
    if (!getRegion(data, region) || isWorldRegion(data, region)) continue
    let run = runs[region]
    if (!run) {
      // Its real start isn't known: the timer starts now (the user's call, 2026-10-29). Its League already won, it
      // has no time at all until a restart.
      run = leagueDone(save, data, region)
        ? { id: `before-${region}-${now}`, startedAt: now, finishedAt: now, untimed: true }
        : { id: `before-${region}-${now}`, startedAt: now }
      changed = true
    }
    if (run.finishedAt == null && leagueDone(save, data, region)) {
      const time = runTime({ startedAt: run.startedAt, finishedAt: now }, now)
      run = { ...run, finishedAt: now, best: run.best == null ? time : Math.min(run.best, time) }
      changed = true
    }
    runs[region] = run
  }
  return changed ? { ...save, extreme: { ...save.extreme, runs } } : save
}

/** A run whose League was just won (the save before and after a settle): its region, for the moment it says so. */
export function runsWon(before: SaveData, after: SaveData): RegionId[] {
  const was = before.extreme?.runs ?? {}
  return Object.entries(after.extreme?.runs ?? {})
    .filter(([id, r]) => r?.finishedAt != null && was[id]?.finishedAt == null && was[id] != null)
    .map(([id]) => id)
}

/**
 * The game as an Extreme page plays it (docs/48, a pure race): the special events (the wheel, the raids, the
 * rebattle), the live events, Trick or Treat, the Gift card, the General upgrades and the region flavours (docs/62) are off, whatever their switches say, and no Pokémon is ever
 * shiny (the user, 2026-10-29: "absolutely no shiny Pokémon anywhere"): the wild odds are 0, and the trainers' and
 * bosses' set shinies are plain. (Gifts and invite rewards never open in Extreme: they wait for the main game and say
 * so.) Applied to the whole page's game data while the Extreme save is played; the same data when it is already.
 */
export function raceData(data: GameData): GameData {
  if (data.viewer?.race) return data
  const off = <T extends { access?: unknown }>(x: T | undefined): T => ({ ...(x as T), access: 'off' })
  const events = Object.fromEntries(
    Object.entries(data.config.events).map(([k, v]) => [
      k,
      v && typeof v === 'object' && 'access' in v ? off(v) : v,
    ]),
  ) as GameData['config']['events']
  return {
    ...data,
    config: {
      ...data.config,
      events,
      liveEvents: off(data.config.liveEvents),
      trickOrTreat: off(data.config.trickOrTreat),
      giftCard: off(data.config.giftCard),
      // The region flavours (docs/62): none in a race, the Titans' bosses included.
      hoennWeather: off(data.config.hoennWeather),
      galarWeather: off(data.config.galarWeather),
      hordes: off(data.config.hordes),
      trials: off(data.config.trials),
      titans: off(data.config.titans),
      general: { ...data.config.general, access: 'off', charmAccess: 'off' },
      shinyChance: 0,
    },
    trainers: Object.fromEntries(
      Object.entries(data.trainers).map(([id, tr]) => [
        id,
        tr.team.some((m) => m.shiny) ? { ...tr, team: tr.team.map(({ shiny: _s, ...m }) => m) } : tr,
      ]),
    ),
    areas: data.areas.map((a) =>
      a.legendaryBoss?.some((b) => b.shiny)
        ? { ...a, legendaryBoss: a.legendaryBoss.map(({ shiny: _s, ...b }) => b) }
        : a,
    ),
    viewer: { admin: !!data.viewer?.admin, race: true },
  }
}

/**
 * No Pokémon of an Extreme save is shiny (docs/48): one from before the rule, or come by any other way, loses its
 * colours. The same save when there is none (and any main save as it is).
 */
export function noShinies(save: SaveData): SaveData {
  if (!isExtreme(save)) return save
  const plain = <T extends { shiny?: boolean }>(p: T): T => {
    if (!p.shiny) return p
    const { shiny: _s, ...rest } = p
    return rest as T
  }
  const box = (b: SaveData['box']) => (b.some((p) => p.shiny) ? b.map(plain) : b)
  const live = box(save.box)
  let parked = save.parked
  for (const [id, block] of Object.entries(save.parked ?? {})) {
    if (!block || !block.box.some((p) => p.shiny)) continue
    parked = { ...parked, [id]: { ...block, box: box(block.box) } }
  }
  const dc = save.dayCare
  const dayCare = dc?.residents.some((r) => r.inst.shiny)
    ? { ...dc, residents: dc.residents.map((r) => ({ ...r, inst: plain(r.inst) })) }
    : dc
  return live === save.box && parked === save.parked && dayCare === dc
    ? save
    : { ...save, box: live, parked, dayCare }
}
