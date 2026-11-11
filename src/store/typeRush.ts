// Type Rush (docs/71 §3), the game's side: what the player did is told to the engine as facts while one runs (a fight's
// hits and K.O.s as they happen, catches, evolutions, hatches, raids won), which counts them in the save. Opening the
// event validates what's done; one that ended with something done and never opened gets its last pop-up.
import {
  countRush,
  rushesOf,
  rushToSettle,
  typesOf,
  validateRush,
  type GameData,
  type LiveEvent,
  type PokeType,
  type RunEvent,
  type RushFact,
  type RushValidation,
  type SaveData,
} from '@/engine'
import { mutateSave, useGame } from './game'
import { currentLive } from './live'
import { newId } from './run'
import { serverNow } from './serverTime'

/** A Type Rush is running for this player now (facts are only worth working out then). */
export const rushRunning = (): boolean => rushesOf(currentLive()).length > 0

/** The save with these facts counted by the running Type Rush (the same save without one, or when none counted). */
export function withRushFacts(save: SaveData, facts: readonly RushFact[]): SaveData {
  if (!facts.length) return save
  const live = currentLive()
  return rushesOf(live).length ? countRush(save, live, facts, serverNow() ?? Date.now()) : save
}

/** These facts counted now, in their own commit (for what happened outside a save change of its own: a fight's hits). */
export function reportRush(facts: readonly RushFact[]): void {
  if (!facts.length || !rushRunning()) return
  mutateSave((s) => {
    const next = withRushFacts(s, facts)
    return next === s ? null : next
  })
}

/** A fight's facts, held until it ends: counted in one commit then, rather than a save written for every hit. */
let held: RushFact[] = []

/** A fight's hits and K.O.s, held for its end (nothing held while no Type Rush runs). */
export function holdRush(facts: readonly RushFact[]): void {
  if (facts.length && rushRunning()) held.push(...facts)
}

/** The fight is over (won, lost, fled, left): what it held is counted now. */
export function flushRush(): void {
  const facts = held
  held = []
  reportRush(facts)
}

/** The catches and evolutions among a result's events, as facts (an evolution counts for the type before or after). */
export function eventFacts(events: readonly RunEvent[], data: GameData): RushFact[] {
  return events.flatMap((e): RushFact[] => {
    if (e.kind === 'caught') return [{ kind: 'catch', types: typesOf(data, e.dex) }]
    if (e.kind === 'evolve')
      return [{ kind: 'evolve', types: [...typesOf(data, e.fromDex), ...typesOf(data, e.toDex)] }]
    return []
  })
}

/** A hatchling, as a fact. */
export const hatchFact = (dex: number, data: GameData): RushFact => ({
  kind: 'hatch',
  types: typesOf(data, dex),
})

/** A raid won with this team: one fact, of every type on it. */
export function raidFact(team: readonly number[], data: GameData): RushFact {
  const types = new Set<PokeType>()
  for (const dex of team) for (const t of typesOf(data, dex)) types.add(t)
  return { kind: 'raid', types: [...types] }
}

/**
 * Opening a Type Rush: what's done is validated (the steps paid, the rewards given) in one commit, and returned for
 * the pop-up to play. Null when there was nothing to validate.
 */
export function openRush(e: LiveEvent): RushValidation | null {
  const { save, data } = useGame.getState()
  if (!save) return null
  const res = validateRush(save, data, e, Date.now(), newId)
  if (!res) return null
  mutateSave(() => res.save)
  return res
}

/** The ended Type Rushes waiting for their last pop-up, the earliest first (none while the server's time is unknown). */
export function rushesToSettle(): LiveEvent[] {
  const { save, data } = useGame.getState()
  const now = serverNow()
  return save && now != null ? rushToSettle(save, data, now) : []
}
