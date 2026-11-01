// Hidden talents (docs/51): each evolution family has one talent. A wild Pokémon has a small chance of carrying it
// (`wildChance`, 5 %); catching one unlocks the talent for every Pokémon of its family the player owns in that region,
// now and later. Legendaries and mythicals always carry theirs; a starter line never carries it, and unlocks it as it
// evolves; any other locked family has `evolveChance` (30 %) of finding it on each evolution. Foes use theirs too.
// The family's talent: the admin's pick (game_config `hiddenTalents.families`), else the bundled one
// (src/data/talents.json, written by `pnpm talents`). This file decides who has what; the effects live where they act
// (battle.ts, damage.ts, run.ts, daycare.ts, breeding.ts, catching.ts).
import { eventOpenTo } from './events'
import { regionOf } from './regions'
import { createRng, type Rng } from './rng'
import type { GameData, PokemonInstance, RegionId, SaveData, Species } from './types'

/**
 * The rarities (the user's calls, 2026-10-30): weak families get a common talent, strong ones an ultra one; a unique
 * talent belongs to one family only (Ditto's Imposter). Names follow the main games' abilities and items wherever a
 * talent does what one of them does, so players recognise them.
 */
export const COMMON_TALENTS = [
  'extraReroll',
  'technician',
  'quick',
  'thickHide',
  'magmaArmor',
  'daycareDarling',
  'static',
  'shedSkin',
  'limber',
  'poisonHeal',
  'flameHeal',
  'roughSkin',
] as const
export const RARE_TALENTS = [
  'opener',
  'finisher',
  'regenerator',
  'naturalCure',
  'powerSpot',
  'payDay',
  'pickup',
  'mindsEye',
  'falseSwipe',
  'intimidate',
  'guts',
  'shellBell',
  'friendGuard',
  'disguise',
  'triplePro',
] as const
export const ULTRA_TALENTS = [
  'reroller',
  'doubleReroll',
  'mirror',
  'ultraSpeed',
  'sturdy',
  'leftovers',
  'raider',
  'flameBody',
  'amuletCoin',
  'magicGuard',
  'skillLink',
  'pressure',
  'foursPro',
] as const
export const UNIQUE_TALENTS = ['imposter'] as const
export const TALENT_KEYS = [...COMMON_TALENTS, ...RARE_TALENTS, ...ULTRA_TALENTS, ...UNIQUE_TALENTS] as const
export type TalentKey = (typeof TALENT_KEYS)[number]
export type TalentTier = 'common' | 'rare' | 'ultra' | 'unique'
export const TALENT_TIERS: readonly TalentTier[] = ['common', 'rare', 'ultra', 'unique']

export const talentTier = (key: TalentKey): TalentTier =>
  (UNIQUE_TALENTS as readonly string[]).includes(key)
    ? 'unique'
    : (ULTRA_TALENTS as readonly string[]).includes(key)
      ? 'ultra'
      : (RARE_TALENTS as readonly string[]).includes(key)
        ? 'rare'
        : 'common'
export const isTalentKey = (v: unknown): v is TalentKey => (TALENT_KEYS as readonly unknown[]).includes(v)

/** Ditto: its family always carries its talent, Imposter, every Ditto owned before the switch included. */
export const DITTO_DEX = 132

/**
 * Each talent's numbers, in one place: the rules pop-up and the sheet read them for their text. Damage is always a
 * share of the hit, never a flat amount (the user's rule, 2026-10-30), so a talent scales with the Pokémon.
 */
export const TALENT = {
  extraReroll: 1,
  doubleReroll: 2,
  /** × Speed. */
  quick: 0.1,
  ultraSpeed: 0.2,
  /** × max HP. */
  thickHide: 0.1,
  /** × the hit when a Pair pays; Three of a Kind (Triple Pro); Four of a Kind (Fours Pro): it pays to reroll for it. */
  technician: 0.05,
  triplePro: 0.1,
  foursPro: 0.25,
  /** × its first hit of a battle. */
  opener: 0.1,
  /** × its hit on a foe under `finisherBelow` of its max HP. */
  finisher: 0.1,
  finisherBelow: 0.33,
  /** × the hits of its partner on the field (a double battle) or of the other sides' Pokémon (a raid). */
  powerSpot: 0.1,
  /** − the hits its partner takes (a double battle), or the other sides' Pokémon (a raid). */
  friendGuard: 0.1,
  /** Share of max HP. */
  regenerator: 0.1,
  leftovers: 0.05,
  /** × an attack the foe is immune to, instead of 0. */
  mindsEye: 0.5,
  /** × damage in raids. */
  raider: 0.05,
  /** × trainer ₽ for the Pokémon it K.O.s, and while it's on the team. */
  payDay: 0.1,
  amuletCoin: 0.25,
  /** Chance after a win. */
  pickup: 0.05,
  /** × Day Care XP. */
  daycareDarling: 0.5,
  /** The Egg clock runs this many times as fast. */
  flameBody: 2,
  /** + the catch die. */
  falseSwipe: 1,
  /** Chance to paralyse a foe that hits it. */
  static: 0.1,
  /** Chance, at the end of each of its turns, to shed its status. */
  shedSkin: 0.3,
  /** Share of the damage dealt that hurts the attacker back. */
  roughSkin: 0.1,
  /** − the hits it takes from each foe's first `intimidateHits` attacks of the battle. */
  intimidate: 0.2,
  intimidateHits: 2,
  /** × its hits while it has a status. */
  guts: 0.25,
  /** Share of the damage it deals, healed. */
  shellBell: 0.1,
  /** − the first hit it takes in a battle. */
  disguise: 0.4,
  /** Upgrade levels its combos pay above their own (level 10 pays as 11). */
  skillLink: 1,
  /** Rerolls each foe that faces it loses. */
  pressure: 1,
} as const

/** Rerolls a talent adds to every battle. */
export const talentRerolls = (talent: TalentKey | null | undefined): number =>
  talent === 'extraReroll' ? TALENT.extraReroll : talent === 'doubleReroll' ? TALENT.doubleReroll : 0

// ---------------------------------------------------------------- the switch and its numbers

export const talentsOn = (data: GameData): boolean => eventOpenTo(data.config.hiddenTalents?.access, data)

const chanceOf = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
}
export const wildTalentChance = (data: GameData): number =>
  chanceOf(data.config.hiddenTalents?.wildChance, 0.05)
export const evolveTalentChance = (data: GameData): number =>
  chanceOf(data.config.hiddenTalents?.evolveChance, 0.3)

// ---------------------------------------------------------------- families

const families = new WeakMap<GameData['species'], Map<number, number>>()

/**
 * Every species' family: the lowest dex joined to it by an evolution (either way) or a form (`form.of`), so a Mega,
 * a Gigantamax, a regional form and what it evolves into (Galarian Meowth's Perrserker) all share one talent.
 */
function familyMap(data: GameData): Map<number, number> {
  const cached = families.get(data.species)
  if (cached) return cached
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const join = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb))
  }
  for (const s of Object.values(data.species)) {
    find(s.dex)
    if (s.form?.of != null) join(s.dex, s.form.of)
    for (const e of s.evolutions) if (data.species[e.toDex]) join(s.dex, e.toDex)
  }
  const out = new Map<number, number>()
  for (const dex of parent.keys()) out.set(dex, find(dex))
  families.set(data.species, out)
  return out
}

/** The family a species belongs to: its lowest dex. */
export const familyOf = (data: GameData, dex: number): number => familyMap(data).get(dex) ?? dex

/** Every species of a family. */
export function familyMembers(data: GameData, dex: number): Species[] {
  const root = familyOf(data, dex)
  return Object.values(data.species).filter((s) => familyOf(data, s.dex) === root)
}

/** The family's talent: the admin's, else the bundled one, else Extra Reroll (a species added since). */
export function familyTalent(data: GameData, dex: number): TalentKey {
  const root = String(familyOf(data, dex))
  const own = data.config.hiddenTalents?.families?.[root]
  if (isTalentKey(own)) return own
  const shipped = data.talentFamilies?.[root]
  return isTalentKey(shipped) ? shipped : 'extraReroll'
}

/** Every species of a starter line: each region's starters and their families. */
export function isStarterFamily(data: GameData, dex: number): boolean {
  const root = familyOf(data, dex)
  return [...data.config.starters, ...(data.regions ?? []).flatMap((r) => r.starters)].some(
    (s) => familyOf(data, s) === root,
  )
}

/** Legendaries and mythicals always carry their talent, and so does Ditto (Imposter, the user's call 2026-10-30). */
// Read from the Egg groups as breeding.ts's isLegendary does (not imported: breeding needs this file).
export const alwaysTalented = (data: GameData, dex: number): boolean =>
  data.eggGroups[dex]?.l === 1 || familyOf(data, dex) === DITTO_DEX

/**
 * A Pokémon met now (wild, a ghost, an Egg, a gift…) carries its family's talent: a legendary always, a starter line
 * never, any other at the wild odds. False while the switch is off, without drawing from `rng`.
 */
export function rollTalent(data: GameData, dex: number, rng: Rng): boolean {
  if (!talentsOn(data)) return false
  if (alwaysTalented(data, dex)) return true
  if (isStarterFamily(data, dex)) return false
  return rng.next() < wildTalentChance(data)
}

/** A trainer's Pokémon carries its talent at the wild odds (a legendary always), starter lines included. */
export const foeTalentChance = (data: GameData, dex: number): number =>
  alwaysTalented(data, dex) ? 1 : wildTalentChance(data)

/**
 * `rollTalent` for a Pokémon that arrives with no draw at hand (a fossil, a raid's, a wheel prize, a gift): drawn from
 * its own id, so the same arrival always rolls the same.
 */
export const rollTalentFor = (data: GameData, dex: number, id: string): boolean =>
  rollTalent(data, dex, idRng(id))

/** An rng seeded from a string (an instance's id): the same draws for the same id. */
export function idRng(id: string): Rng {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return createRng(h >>> 0 || 1)
}

// ---------------------------------------------------------------- the player's families

/** The families whose talent is unlocked in a region (the one being played by default). */
export const unlockedFamilies = (save: SaveData, region: RegionId = regionOf(save)): number[] =>
  save.talents?.[region] ?? []

export const familyUnlocked = (
  save: SaveData,
  data: GameData,
  dex: number,
  region: RegionId = regionOf(save),
): boolean => unlockedFamilies(save, region).includes(familyOf(data, dex))

/** Unlocks the family's talent in a region, and notes it met. The same save back when it already was. */
export function unlockFamily(
  save: SaveData,
  data: GameData,
  dex: number,
  region: RegionId = regionOf(save),
): SaveData {
  const met = noteTalentMet(save, data, dex)
  if (familyUnlocked(met, data, dex, region)) return met
  return syncTalents(
    {
      ...met,
      talents: { ...met.talents, [region]: [...unlockedFamilies(met, region), familyOf(data, dex)] },
    },
    data,
  )
}

/** The family's talent has been met (shown by a wild one, unlocked, or seen on a foe): its name shows from now on. */
export function noteTalentMet(save: SaveData, data: GameData, dex: number): SaveData {
  const root = familyOf(data, dex)
  return save.talentsMet?.includes(root) ? save : { ...save, talentsMet: [...(save.talentsMet ?? []), root] }
}

export const talentMet = (save: SaveData | null | undefined, data: GameData, dex: number): boolean =>
  !!save?.talentsMet?.includes(familyOf(data, dex)) || (!!save && familyUnlocked(save, data, dex))

/** The talent this Pokémon fights with: its family's when it carries it and the switch is on. */
export const talentOf = (data: GameData, inst: Pick<PokemonInstance, 'dex' | 'talent'>): TalentKey | null =>
  inst.talent && talentsOn(data) ? familyTalent(data, inst.dex) : null

/** The talent a Pokémon fights with when it carries one: a foe dealt it, a clone (Versus, raids) of one that has it. */
export const carriedTalent = (data: GameData, dex: number, has: boolean | undefined): TalentKey | null =>
  has && talentsOn(data) ? familyTalent(data, dex) : null

const evolvedForms = new WeakMap<GameData['species'], Set<number>>()

/** A species another one evolves into (Ivysaur, Charizard), not a first stage nor a form. */
function isEvolvedForm(data: GameData, dex: number): boolean {
  let set = evolvedForms.get(data.species)
  if (!set) {
    set = new Set(Object.values(data.species).flatMap((s) => s.evolutions.map((e) => e.toDex)))
    evolvedForms.set(data.species, set)
  }
  return set.has(dex)
}

/**
 * A Pokémon that carries its talent however it came, those owned before the switch included (the user's calls,
 * 2026-10-30 and 31): a legendary or mythical, Ditto, and a starter line's evolved member (it found its talent
 * evolving, as starter lines always do, had the switch been on).
 */
const ownedCarries = (data: GameData, dex: number): boolean =>
  alwaysTalented(data, dex) || (isStarterFamily(data, dex) && isEvolvedForm(data, dex))

/**
 * Every Pokémon the save holds, each under its region: the live Box, the parked regions' Boxes and the Day Care's
 * residents. A Pokémon that came with its talent (a trade, a gift, a world's Pokémon gone home) unlocks its family in
 * its region, and so does one that always carries it (`ownedCarries`: a legendary, Ditto, an evolved starter); every
 * Pokémon of an unlocked family carries it from then on, and never loses it. Called as every save settles; the same
 * save back when nothing changes.
 */
export function syncTalents(save: SaveData, data: GameData): SaveData {
  const live = regionOf(save)
  const unlocked = new Map<RegionId, Set<number>>()
  const setOf = (region: RegionId) => {
    let s = unlocked.get(region)
    if (!s) unlocked.set(region, (s = new Set(save.talents?.[region] ?? [])))
    return s
  }
  const groups: [RegionId, readonly PokemonInstance[]][] = [
    [live, save.box],
    ...Object.entries(save.parked ?? {}).flatMap(([r, b]) =>
      b ? [[r, b.box] as [RegionId, PokemonInstance[]]] : [],
    ),
    ...(save.dayCare?.residents ?? []).map((r) => [r.region, [r.inst]] as [RegionId, PokemonInstance[]]),
  ]
  let changed = false
  const on = talentsOn(data)
  for (const [region, mons] of groups)
    for (const p of mons)
      if ((p.talent || (on && ownedCarries(data, p.dex))) && !setOf(region).has(familyOf(data, p.dex))) {
        setOf(region).add(familyOf(data, p.dex))
        changed = true
      }
  const carry = (region: RegionId, mons: PokemonInstance[]): PokemonInstance[] => {
    const set = setOf(region)
    if (!mons.some((p) => !p.talent && set.has(familyOf(data, p.dex)))) return mons
    changed = true
    return mons.map((p) => (!p.talent && set.has(familyOf(data, p.dex)) ? { ...p, talent: true } : p))
  }
  const box = carry(live, save.box)
  const parked = save.parked
    ? Object.fromEntries(
        Object.entries(save.parked).map(([r, b]) => [r, b ? { ...b, box: carry(r, b.box) } : b]),
      )
    : undefined
  const residents = save.dayCare?.residents.map((r) => {
    const [inst] = carry(r.region, [r.inst])
    return inst === r.inst ? r : { ...r, inst: inst! }
  })
  if (!changed) return save
  const talents = { ...save.talents }
  for (const [r, s] of unlocked) if (s.size) talents[r] = [...s]
  const met = new Set(save.talentsMet ?? [])
  for (const s of unlocked.values()) for (const root of s) met.add(root)
  return {
    ...save,
    box,
    ...(parked && { parked: parked as SaveData['parked'] }),
    ...(save.dayCare && residents && { dayCare: { ...save.dayCare, residents } }),
    talents,
    talentsMet: [...met],
  }
}

// ---------------------------------------------------------------- evolving

/**
 * A family still locked finds its talent as one of its Pokémon evolves: a starter line always, any other on
 * `evolveChance`. Each evolution in `events` tries once (a Pokémon evolving twice in one go tries twice). Returns the
 * save and the talents found, in the order they came.
 */
export function talentOnEvolve(
  save: SaveData,
  data: GameData,
  events: readonly { kind: string; uid?: string; toDex?: number }[],
  rng: Rng,
  region: RegionId = regionOf(save),
): { save: SaveData; found: { uid: string; dex: number; talent: TalentKey }[] } {
  const found: { uid: string; dex: number; talent: TalentKey }[] = []
  if (!talentsOn(data)) return { save, found }
  let next = save
  for (const e of events) {
    if (e.kind !== 'evolve' || e.toDex == null || !e.uid) continue
    if (familyUnlocked(next, data, e.toDex, region)) continue
    if (!isStarterFamily(data, e.toDex) && !(rng.next() < evolveTalentChance(data))) continue
    next = unlockFamily(next, data, e.toDex, region)
    found.push({ uid: e.uid, dex: e.toDex, talent: familyTalent(data, e.toDex) })
  }
  return { save: next, found }
}

/** A Talent Candy (docs/51) would reveal this Pokémon's talent: the switch is on and its family hasn't found it here. */
export const talentCandyFits = (
  save: SaveData,
  data: GameData,
  inst: Pick<PokemonInstance, 'dex' | 'talent'>,
): boolean => talentsOn(data) && !inst.talent && !familyUnlocked(save, data, inst.dex)

/** + the catch die when this Pokémon made the K.O.: False Swipe (docs/51). */
export const catchTalentBonus = (
  data: GameData,
  inst: Pick<PokemonInstance, 'dex' | 'talent'> | undefined,
): number => (inst && talentOf(data, inst) === 'falseSwipe' ? TALENT.falseSwipe : 0)
