// Catching: after a K.O. the player throws the catch die (a d6), plus one ball's bonus. Reach the species' catch value
// (1 = always, 9 = legendary) and the Pokémon is caught; miss and it flees. A throw that falls short can be helped by
// a Bait (docs/25): its own die adds to the total. Capture Luck (engine/general) may keep a wild one for a second throw.
import { bossCaught, fightBosses } from './encounters'
import { itemOn } from './items'
import { createInstance, instanceMaxHp } from './progression'
import type { Rng } from './rng'
import { getInstance, progressOf, unlockedHiddenAreas, type RunEvent } from './run'
import { familyTalent, familyUnlocked, talentsOn, unlockFamily } from './talents'
import type { GameData, ItemDef, PokemonInstance, SaveData } from './types'
import {
  addUnownLetters,
  isUnownLetter,
  payUnownDex,
  UNOWN_DEX,
  UNOWN_LETTERS,
  unownCatchOpen,
  unownDexOf,
  unownDexOpen,
} from './unownDex'
import { worldOfArea } from './worldList'

export const CATCH_DIE = 6

/**
 * `learn` (docs/51): a weaker copy carrying its family's hidden talent, still locked here. Caught, its talent passes to
 * the family and the Pokémon is let go: `uid` is the copy the player keeps.
 */
export type CatchTarget = { mode: 'new' } | { mode: 'replace'; uid: string; level: number } | { mode: 'learn'; uid: string }

/**
 * Can this K.O.'d Pokémon be caught? A species not in the Pokédex yet, or — wild ones only — a stronger copy of one you
 * own, which then replaces your weakest copy. A wild shiny can always be caught and always joins as an extra copy, never
 * replacing one you own. A legendary is one of a kind.
 *
 * Shiny and normal are separate Pokémon in the Box and on the team, however much they share a Pokédex entry: a plain
 * catch measures itself against your plain copies only, so a level-40 Pidgey never takes the place of the shiny Pidgey
 * you went looking for — and when the shiny is all you have, the plain one joins as its own Pokémon. (The Pokédex does
 * not care — one entry per species, shiny or not.)
 */
export function catchTarget(
  save: SaveData,
  dex: number,
  level: number,
  kind: 'wild' | 'boss',
  data: GameData,
  shiny = false,
  areaId: string = save.currentAreaId,
  /** It carries its family's hidden talent (docs/51). */
  talent = false,
): CatchTarget | null {
  const target = ordinaryTarget(save, dex, level, kind, data, shiny, areaId)
  if (target || !talent || !talentsOn(data) || familyUnlocked(save, data, dex)) return target
  // A talent still locked here is worth a catch whatever its level: it passes to the family, the Pokémon is let go.
  const own = save.box.filter((p) => p.dex === dex && !p.shiny).sort((a, b) => b.level - a.level)[0] ?? save.box.find((p) => p.dex === dex)
  return own ? { mode: 'learn', uid: own.id } : null
}

function ordinaryTarget(
  save: SaveData,
  dex: number,
  level: number,
  kind: 'wild' | 'boss',
  data: GameData,
  shiny: boolean,
  areaId: string,
): CatchTarget | null {
  if (!data.species[dex]) return null
  if (!save.pokedex.includes(dex)) return { mode: 'new' }
  // A small world's boss is its own catch (docs/26 §2.5): until it's caught there, it joins as a Pokémon of its own.
  if (kind === 'boss') return worldBossOpen(save, data, areaId, dex) ? { mode: 'new' } : null
  if (kind !== 'wild') return null
  // A shiny never overwrites a copy you own, whatever its level: it always joins as its own Pokémon.
  if (shiny) return { mode: 'new' }
  const plain = save.box.filter((p) => p.dex === dex && !p.shiny)
  // Only shiny copies (or none here at all): the plain one is a Pokémon you don't have, so it joins as its own.
  if (!plain.length) return { mode: 'new' }
  const weakest = plain.sort((a, b) => a.level - b.level)[0]!
  if (weakest.level < level) return { mode: 'replace', uid: weakest.id, level: weakest.level }
  // A letter missing from the Unown Pokédex (docs/41): every Unown caught is one, so a weaker one is still worth it. It
  // joins as its own, the weaker copy is let go, and its letter stays on the page.
  if (dex === UNOWN_DEX && unownCatchOpen(save, data)) return { mode: 'new' }
  return null
}

/** This area is a small world's and this boss of it hasn't been caught there yet. */
function worldBossOpen(save: SaveData, data: GameData, areaId: string, dex: number): boolean {
  const area = data.areas.find((a) => a.id === areaId)
  if (!area || !worldOfArea(data, area) || !fightBosses(area, data).some((b) => b.dex === dex)) return false
  return !bossCaught(area, progressOf(save, areaId), save.pokedex, dex, data)
}

export const catchValueOf = (data: GameData, dex: number): number =>
  Math.max(1, Math.min(9, Math.round(data.species[dex]?.catchValue ?? 5)))

/** P(d6 + bonus ≥ value). */
export function catchChance(value: number, bonus: number): number {
  const faceNeeded = value - bonus
  return Math.max(0, Math.min(1, (CATCH_DIE + 1 - faceNeeded) / CATCH_DIE))
}

/** The throw can't miss: its bonus alone reaches the need, whatever the die. No die, no suspense. */
export const sureThrow = (r: { bonus: number; need: number }): boolean => catchChance(r.need, r.bonus) >= 1

export interface CatchRoll {
  die: number
  bonus: number
  /** The Bait's die, once one was thrown after the ball fell short. */
  bait?: number
  total: number
  need: number
  caught: boolean
}

export function rollCatch(value: number, bonus: number, rng: Rng): CatchRoll {
  const die = rng.int(1, CATCH_DIE)
  const total = die + bonus
  return { die, bonus, total, need: value, caught: total >= value }
}

// ---------------------------------------------------------------- the Bait (docs/25)

/** The Bait's die unless its item says otherwise: three 1s, two 2s and a 3. */
export const BAIT_FACES: readonly number[] = [1, 1, 1, 2, 2, 3]

/** A Bait's six faces (whole numbers, 0 and up). */
export function baitFaces(item: ItemDef | undefined): readonly number[] {
  const faces = item?.effect.kind === 'bait' ? item.effect.faces.filter((f) => Number.isFinite(f) && f >= 0) : []
  return faces.length ? faces.map((f) => Math.floor(f)) : BAIT_FACES
}

/** The chance (0–1) that this Bait turns a throw that fell short into a catch. */
export function baitChance(roll: Pick<CatchRoll, 'total' | 'need'>, faces: readonly number[]): number {
  if (!faces.length) return 0
  return faces.filter((f) => roll.total + f >= roll.need).length / faces.length
}

/**
 * The Bait the catch offers after this throw, or null: the throw fell short, no Bait has been thrown yet, and the bag
 * holds one (switched on) that could still make it — a hopeless one isn't offered. The likeliest first.
 */
export function baitFor(roll: CatchRoll, save: Pick<SaveData, 'inventory'>, data: GameData): string | null {
  if (roll.caught || roll.bait != null) return null
  const offers = Object.entries(save.inventory)
    .filter(([k, n]) => n > 0 && data.items[k]?.effect.kind === 'bait' && itemOn(data, k))
    .map(([k]) => ({ k, odds: baitChance(roll, baitFaces(data.items[k])) }))
    .filter((o) => o.odds > 0)
    .sort((a, b) => b.odds - a.odds || a.k.localeCompare(b.k))
  return offers[0]?.k ?? null
}

/** Throw the Bait: one of its faces adds to the throw's total. */
export function rollBait(roll: CatchRoll, faces: readonly number[], rng: Rng): CatchRoll {
  const bait = faces.length ? rng.pick(faces) : 0
  const total = roll.total + bait
  return { ...roll, bait, total, caught: total >= roll.need }
}

// ---------------------------------------------------------------- the wobbles

/** A ball's wobbles before the result: a throw's, and the Bait's last ones from the ground. */
export const CATCH_WOBBLES = 3
export const BAIT_WOBBLES = 2

/**
 * How many times the ball wobbles before the result, as in the main games: a catch every time, a miss fewer the
 * further it fell short — all of them one short, none from `max + 1` short. A miss used to stop one short of a catch,
 * so the last wobble gave the result away before it came.
 */
export function catchWobbles(
  roll: Pick<CatchRoll, 'total' | 'need' | 'caught'>,
  max = CATCH_WOBBLES,
): number {
  if (roll.caught) return max
  return Math.max(0, Math.min(max, max + 1 - (roll.need - roll.total)))
}

/**
 * The wobbles of each part of a throw (docs/25): `throw`, the ball's own, measured on the throw alone (before any
 * Bait, which only follows a miss); `bait`, the last ones from the ground once a Bait was thrown (0 without one).
 */
export function catchShakes(roll: Pick<CatchRoll, 'total' | 'need' | 'caught' | 'bait'>): {
  throw: number
  bait: number
} {
  if (roll.bait == null) return { throw: catchWobbles(roll), bait: 0 }
  return {
    throw: catchWobbles({ total: roll.total - roll.bait, need: roll.need, caught: false }),
    bait: catchWobbles(roll, BAIT_WOBBLES),
  }
}

export interface CatchResult {
  save: SaveData
  events: RunEvent[]
  caughtId: string
  /** New catch with a full team: offer "Add to team?" */
  needsTeamChoice: boolean
}

/**
 * Keep the catch: a new Pokémon joins the team (or waits in the Box); a stronger copy replaces the weaker one in place.
 * An Unown's letter (`unownLetterFor`, docs/41) goes on the region's Unown Pokédex, whose last letter pays its prize.
 */
export function applyCatch(
  save: SaveData,
  caught: { dex: number; level: number; shiny?: boolean; letter?: string; talent?: boolean },
  target: CatchTarget,
  data: GameData,
  now: number,
  newId: () => string,
): CatchResult {
  // Extreme mode (docs/48): no Pokémon is ever shiny there, however it was met.
  if (save.mode === 'extreme' && caught.shiny) caught = { ...caught, shiny: false }
  const hiddenBefore = new Set(unlockedHiddenAreas(save, data))
  const events: RunEvent[] = []
  let next: SaveData
  let caughtId: string
  let needsTeamChoice = false
  const talent = !!caught.talent && talentsOn(data)
  // A weaker copy caught for its talent (docs/51): the family learns it, the Pokémon is let go.
  if (target.mode === 'learn') {
    const kept = getInstance(save, target.uid)
    if (!kept) return { save, events, caughtId: target.uid, needsTeamChoice: false }
    const learnt = talent ? unlockFamily(save, data, caught.dex) : save
    if (learnt !== save) events.push({ kind: 'talent', uid: kept.id, dex: kept.dex, talent: familyTalent(data, caught.dex), how: 'passed' })
    return { save: learnt, events, caughtId: kept.id, needsTeamChoice: false }
  }
  const old = target.mode === 'replace' ? getInstance(save, target.uid) : undefined
  const letter = caught.dex === UNOWN_DEX && isUnownLetter(caught.letter) ? caught.letter : null
  if (old) {
    // The stronger copy is the one just caught, colours (and letter) included.
    const { shiny: _oldShiny, letter: _oldLetter, ...rest } = old
    const upgraded: PokemonInstance = {
      ...rest,
      level: caught.level,
      xp: 0,
      caughtAt: now,
      ...(caught.shiny && { shiny: true }),
      ...(letter && { letter }),
    }
    upgraded.currentHp = instanceMaxHp(upgraded, data)
    next = { ...save, box: save.box.map((p) => (p.id === old.id ? upgraded : p)) }
    caughtId = old.id
    events.push({ kind: 'caught', uid: old.id, dex: caught.dex, level: caught.level, joinedTeam: save.team.includes(old.id), replacedLevel: old.level })
  } else {
    const inst = createInstance(caught.dex, caught.level, data, newId(), now)
    if (caught.shiny) inst.shiny = true
    if (letter) inst.letter = letter
    const joined = save.team.length < data.config.maxTeamSize
    next = {
      ...save,
      box: [...save.box, inst],
      pokedex: save.pokedex.includes(caught.dex) ? save.pokedex : [...save.pokedex, caught.dex],
      team: joined ? [...save.team, inst.id] : save.team,
    }
    caughtId = inst.id
    needsTeamChoice = !joined
    events.push({ kind: 'caught', uid: inst.id, dex: inst.dex, level: inst.level, joinedTeam: joined, isNew: !save.pokedex.includes(caught.dex) })
  }
  // Noted here, whatever the switch says: the Box keeps one Unown, so a weaker one is let go once it settles.
  if (letter) {
    const isNew = !unownDexOf(next).includes(letter)
    next = addUnownLetters(next, [letter])
    const prize = payUnownDex(next, data)
    next = prize.save
    if (unownDexOpen(next, data))
      events.push({
        kind: 'unown_letter',
        letter,
        isNew,
        found: unownDexOf(next).length,
        total: UNOWN_LETTERS.length,
        ...(prize.paid > 0 && { reward: prize.paid }),
      })
  }
  // Its hidden talent (docs/51): the whole family carries it from now on, here.
  if (talent && !familyUnlocked(next, data, caught.dex)) {
    next = unlockFamily(next, data, caught.dex)
    events.push({ kind: 'talent', uid: caughtId, dex: caught.dex, talent: familyTalent(data, caught.dex), how: 'caught' })
  }
  // Secret areas whose Pokédex condition this catch just met.
  for (const id of unlockedHiddenAreas(next, data)) if (!hiddenBefore.has(id)) events.push({ kind: 'secret_unlocked', areaId: id })
  return { save: next, events, caughtId, needsTeamChoice }
}
