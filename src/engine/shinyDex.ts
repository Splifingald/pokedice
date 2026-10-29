// The shiny Pokédex (docs/39): each region's Pokédex has a second page, the species owned shiny there, once that
// region's league is beaten. It only shows what the save holds; no server function acts for it.
import { inWorldRegion, leagueDone, regionOf } from './regions'
import type { GameData, PokemonInstance, RegionId, SaveData } from './types'

/** The page is there: a real region (not a small world), and its league beaten. */
// Never in Extreme mode, where no Pokémon is shiny (docs/48).
export const shinyDexOpen = (save: SaveData, data: GameData): boolean =>
  save.mode !== 'extreme' && !inWorldRegion(save, data) && leagueDone(save, data)

/** Its rules, once: at the first league beaten. */
export const shinyDexRulesDue = (save: SaveData, data: GameData): boolean =>
  !save.shinyDexSeen && shinyDexOpen(save, data)

export const markShinyDexSeen = (save: SaveData): SaveData =>
  save.shinyDexSeen ? save : { ...save, shinyDexSeen: true }

/** The species owned shiny in a region (the one being played by default). */
export const shinyDexOf = (save: SaveData, region: RegionId = regionOf(save)): number[] =>
  save.shinyDex?.[region] ?? []

// A fossil still reviving isn't in the Pokédex yet, so it isn't in the shiny one either.
const shinies = (mons: readonly PokemonInstance[]) =>
  mons.filter((p) => p.shiny && p.revivesAt == null).map((p) => p.dex)

/**
 * Notes every shiny the save holds under its region: the live Box, the parked regions' Boxes and the Day Care's
 * residents. A species stays once noted, as the Pokédex keeps a catch traded away. Called as every save settles, so
 * a catch, a hatch, a trade or an evolution is in it at once, and a save from before it fills from its Boxes. The
 * same save back when nothing is new.
 */
export function noteShinyDex(save: SaveData): SaveData {
  const found = new Map<RegionId, number[]>()
  const add = (region: RegionId, dexes: number[]) => {
    if (dexes.length) found.set(region, [...(found.get(region) ?? []), ...dexes])
  }
  add(regionOf(save), shinies(save.box))
  for (const [region, block] of Object.entries(save.parked ?? {})) if (block) add(region, shinies(block.box))
  for (const r of save.dayCare?.residents ?? []) add(r.region, shinies([r.inst]))
  let next: Partial<Record<RegionId, number[]>> | null = null
  for (const [region, dexes] of found) {
    const had = save.shinyDex?.[region] ?? []
    const fresh = [...new Set(dexes)].filter((d) => !had.includes(d))
    if (!fresh.length) continue
    next = { ...(next ?? save.shinyDex), [region]: [...had, ...fresh] }
  }
  return next ? { ...save, shinyDex: next } : save
}
