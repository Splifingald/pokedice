// The Unown Pokédex (docs/41): the 28 letters of Unown, a page of their own beside the region's Pokédex, which keeps
// its one Unown entry. It opens with the first area of the region where Unown live (Johto's Ruins of Alph), and its
// last letter pays a prize in ₽ once. The letters are noted on the device, like the Pokédex; no server function acts
// for it.
import { eventOpenTo } from './events'
import type { Rng } from './rng'
import { inWorldRegion, regionOf, regionOfArea } from './regions'
import { isAreaUnlocked } from './run'
import type { Area, GameData, PokemonInstance, RegionId, SaveData } from './types'

export const UNOWN_DEX = 201

/** The letters in the games' order: A to Z, then ! and ? (HeartGold and SoulSilver's two). */
// prettier-ignore
export const UNOWN_LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '!', '?',
] as const
export type UnownLetter = (typeof UNOWN_LETTERS)[number]

export const isUnownLetter = (v: unknown): v is UnownLetter => UNOWN_LETTERS.includes(v as UnownLetter)

/** An Unown's letter: one caught before the letters (or hatched, traded, given) is an A, the form the game drew. */
export const letterOf = (p: Pick<PokemonInstance, 'letter'>): UnownLetter =>
  isUnownLetter(p.letter) ? p.letter : 'a'

/** How a letter reads: the capital, or the sign. */
export const letterText = (l: UnownLetter): string => l.toUpperCase()

export const unownDexOn = (data: GameData): boolean => eventOpenTo(data.config.unownDex?.access, data)

/** The prize for the last letter, in ₽ (the admin's number, never below 0). */
export const unownReward = (data: GameData): number =>
  Math.max(0, Math.floor(data.config.unownDex?.reward ?? 0))

/** Unown live here: a row of the area's wild pool, at any hour. */
export const unownLivesIn = (area: Area): boolean =>
  area.wildPool.some((w) => w.dex === UNOWN_DEX && w.weight > 0)

const unownWeight = (a: Area) =>
  a.wildPool.reduce((n, w) => n + (w.dex === UNOWN_DEX ? Math.max(0, w.weight) : 0), 0)

/**
 * Where to find Unown in the region being played, or null (none opened yet, or a small world): the area the player
 * stands in when they live there, else the opened one where they come most often (Johto's Ruins of Alph before
 * Mt. Silver, whose pool has a little of everything).
 */
export function unownArea(save: SaveData, data: GameData): Area | null {
  if (inWorldRegion(save, data)) return null
  const region = regionOf(save)
  const open = data.areas.filter(
    (a) => regionOfArea(a) === region && unownLivesIn(a) && isAreaUnlocked(save, a.id, data),
  )
  return (
    open.find((a) => a.id === save.currentAreaId) ??
    open.sort((a, b) => unownWeight(b) - unownWeight(a))[0] ??
    null
  )
}

/** The page is there: the switch, and an area of this region opened where Unown live. */
export const unownDexOpen = (save: SaveData, data: GameData): boolean =>
  unownDexOn(data) && !!unownArea(save, data)

/** The letters found in a region (the one being played by default), in the games' order. */
export function unownDexOf(save: SaveData, region: RegionId = regionOf(save)): UnownLetter[] {
  const had = new Set(save.unownDex?.[region] ?? [])
  return UNOWN_LETTERS.filter((l) => had.has(l))
}

export const unownDexComplete = (save: SaveData, region?: RegionId): boolean =>
  unownDexOf(save, region).length >= UNOWN_LETTERS.length

/**
 * A known Unown can still be caught: the page is open and a letter is missing. Every Unown caught then is a letter
 * not found yet (`unownLetterFor`), so it's always worth the throw, and the 28 come in 28 catches.
 */
export const unownCatchOpen = (save: SaveData, data: GameData): boolean =>
  unownDexOpen(save, data) && !unownDexComplete(save)

/**
 * The letter of an Unown just caught: one missing from the region's page, at random, so every variant is found; once
 * all are, any of them.
 */
export function unownLetterFor(save: SaveData, rng: Rng): UnownLetter {
  const had = new Set(unownDexOf(save))
  const missing = UNOWN_LETTERS.filter((l) => !had.has(l))
  return rng.pick(missing.length ? missing : UNOWN_LETTERS)
}

/** Notes letters under a region, never taking one off. The same save back when nothing is new. */
export function addUnownLetters(
  save: SaveData,
  found: readonly UnownLetter[],
  region: RegionId = regionOf(save),
): SaveData {
  const had = save.unownDex?.[region] ?? []
  const fresh = [...new Set(found)].filter((l) => !had.includes(l))
  if (!fresh.length) return save
  return { ...save, unownDex: { ...save.unownDex, [region]: [...had, ...fresh] } }
}

// A fossil still reviving isn't in the Pokédex yet; an Unown never is one, but the rule is the Pokédex's.
const lettersIn = (mons: readonly PokemonInstance[]) =>
  mons.filter((p) => p.dex === UNOWN_DEX && p.revivesAt == null).map(letterOf)

/**
 * Notes the letter of every Unown the save holds under its region: the live Box, the parked regions' Boxes and the
 * Day Care's residents. A Box keeps one Unown (one copy per species), so a catch notes its letter itself
 * (`applyCatch`); this fills a save from before the page from what it holds, and an Unown that came another way (a
 * trade, an Egg, a gift). Called as every save settles.
 */
export function noteUnownDex(save: SaveData): SaveData {
  let next = addUnownLetters(save, lettersIn(save.box))
  for (const [region, block] of Object.entries(save.parked ?? {}))
    if (block) next = addUnownLetters(next, lettersIn(block.box), region)
  for (const r of save.dayCare?.residents ?? []) next = addUnownLetters(next, lettersIn([r.inst]), r.region)
  return next
}

/**
 * The prize, once per region: the page open, its 28 letters found, not paid yet. It goes to the region's purse (the
 * region being played: only its page can be complete while open). The same save back and 0 otherwise.
 */
export function payUnownDex(save: SaveData, data: GameData): { save: SaveData; paid: number } {
  const region = regionOf(save)
  if (unownDexPaid(save, region) || !unownDexOpen(save, data) || !unownDexComplete(save))
    return { save, paid: 0 }
  const paid = unownReward(data)
  return {
    save: { ...save, gold: save.gold + paid, unownDexPaid: [...(save.unownDexPaid ?? []), region] },
    paid,
  }
}

/** The prize of this region's page was paid. */
export const unownDexPaid = (save: SaveData, region: RegionId = regionOf(save)): boolean =>
  !!save.unownDexPaid?.includes(region)

/** Its rules, once: when the page first opens. */
export const unownDexRulesDue = (save: SaveData, data: GameData): boolean =>
  !save.unownDexSeen && unownDexOpen(save, data)

export const markUnownDexSeen = (save: SaveData): SaveData =>
  save.unownDexSeen ? save : { ...save, unownDexSeen: true }
