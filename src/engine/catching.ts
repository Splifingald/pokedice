// Catching: after a K.O. the player throws the catch die (a d6), plus one ball's bonus. Reach the species' catch value
// (1 = always, 9 = legendary) and the Pokémon is caught; miss and it flees.
import { createInstance, instanceMaxHp } from './progression'
import type { Rng } from './rng'
import { getInstance, unlockedHiddenAreas, type RunEvent } from './run'
import type { GameData, PokemonInstance, SaveData } from './types'

export const CATCH_DIE = 6

export type CatchTarget = { mode: 'new' } | { mode: 'replace'; uid: string; level: number }

/**
 * Can this K.O.'d Pokémon be caught? A species not in the Pokédex yet, or — wild ones only — a stronger copy of one you
 * own, which then replaces your weakest copy. A legendary is one of a kind.
 */
export function catchTarget(save: SaveData, dex: number, level: number, kind: 'wild' | 'boss', data: GameData): CatchTarget | null {
  if (!data.species[dex]) return null
  if (!save.pokedex.includes(dex)) return { mode: 'new' }
  if (kind !== 'wild') return null
  const weakest = save.box.filter((p) => p.dex === dex).sort((a, b) => a.level - b.level)[0]
  return weakest && weakest.level < level ? { mode: 'replace', uid: weakest.id, level: weakest.level } : null
}

export const catchValueOf = (data: GameData, dex: number): number =>
  Math.max(1, Math.min(9, Math.round(data.species[dex]?.catchValue ?? 5)))

/** P(d6 + bonus ≥ value). */
export function catchChance(value: number, bonus: number): number {
  const faceNeeded = value - bonus
  return Math.max(0, Math.min(1, (CATCH_DIE + 1 - faceNeeded) / CATCH_DIE))
}

export interface CatchRoll {
  die: number
  bonus: number
  total: number
  need: number
  caught: boolean
}

export function rollCatch(value: number, bonus: number, rng: Rng): CatchRoll {
  const die = rng.int(1, CATCH_DIE)
  const total = die + bonus
  return { die, bonus, total, need: value, caught: total >= value }
}

export interface CatchResult {
  save: SaveData
  events: RunEvent[]
  caughtId: string
  /** New catch with a full team: offer "Add to team?" */
  needsTeamChoice: boolean
}

/** Keep the catch: a new Pokémon joins the team (or waits in the Box); a stronger copy replaces the weaker one in place. */
export function applyCatch(
  save: SaveData,
  caught: { dex: number; level: number; shiny?: boolean },
  target: CatchTarget,
  data: GameData,
  now: number,
  newId: () => string,
): CatchResult {
  const hiddenBefore = new Set(unlockedHiddenAreas(save, data))
  const events: RunEvent[] = []
  let next: SaveData
  let caughtId: string
  let needsTeamChoice = false
  const old = target.mode === 'replace' ? getInstance(save, target.uid) : undefined
  if (old) {
    // The stronger copy is the one just caught, colours included.
    const { shiny: _oldShiny, ...rest } = old
    const upgraded: PokemonInstance = { ...rest, level: caught.level, xp: 0, regenCarry: 0, caughtAt: now, ...(caught.shiny && { shiny: true }) }
    upgraded.currentHp = instanceMaxHp(upgraded, data)
    next = { ...save, box: save.box.map((p) => (p.id === old.id ? upgraded : p)) }
    caughtId = old.id
    events.push({ kind: 'caught', uid: old.id, dex: caught.dex, level: caught.level, joinedTeam: save.team.includes(old.id), replacedLevel: old.level })
  } else {
    const inst = createInstance(caught.dex, caught.level, data, newId(), now)
    if (caught.shiny) inst.shiny = true
    const joined = save.team.length < data.config.maxTeamSize
    next = {
      ...save,
      box: [...save.box, inst],
      pokedex: save.pokedex.includes(caught.dex) ? save.pokedex : [...save.pokedex, caught.dex],
      team: joined ? [...save.team, inst.id] : save.team,
    }
    caughtId = inst.id
    needsTeamChoice = !joined
    events.push({ kind: 'caught', uid: inst.id, dex: inst.dex, level: inst.level, joinedTeam: joined })
  }
  // Secret areas whose Pokédex condition this catch just met.
  for (const id of unlockedHiddenAreas(next, data)) if (!hiddenBefore.has(id)) events.push({ kind: 'secret_unlocked', areaId: id })
  return { save: next, events, caughtId, needsTeamChoice }
}
