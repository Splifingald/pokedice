import type { Rng } from './rng'
import { STATUS_KINDS, type DiceEntry, type DieType, type Face, type GameData, type StatusKind } from './types'

export interface RolledDie {
  type: DieType
  faceIndex: number
}

const FALLBACK_FACE: Face = { kind: 'number', value: 0 }

export function facesOf(type: DieType, data: GameData): Face[] {
  return data.diceTypes[type]?.faces ?? []
}

export function faceOf(die: RolledDie, data: GameData): Face {
  return facesOf(die.type, data)[die.faceIndex] ?? FALLBACK_FACE
}

/** The number a face contributes to damage and combos — status faces use their fallback value. */
export function faceValue(face: Face): number {
  return face.value
}

export function dieValue(die: RolledDie, data: GameData): number {
  return faceValue(faceOf(die, data))
}

export function expandDice(entries: readonly DiceEntry[]): DieType[] {
  const out: DieType[] = []
  for (const e of entries) for (let i = 0; i < e.count; i++) out.push(e.type)
  return out
}

export function rollDie(type: DieType, data: GameData, rng: Rng): RolledDie {
  const n = Math.max(1, facesOf(type, data).length)
  return { type, faceIndex: rng.int(0, n - 1) }
}

export function rollAll(types: readonly DieType[], data: GameData, rng: Rng): RolledDie[] {
  return types.map((t) => rollDie(t, data, rng))
}

/** Rethrow the dice whose mask entry is true; the others are kept. */
export function rerollMasked(dice: readonly RolledDie[], mask: readonly boolean[], data: GameData, rng: Rng): RolledDie[] {
  return dice.map((d, i) => (mask[i] ? rollDie(d.type, data, rng) : d))
}

export function statusCounts(dice: readonly RolledDie[], data: GameData): Record<StatusKind, number> {
  const counts = Object.fromEntries(STATUS_KINDS.map((k) => [k, 0])) as Record<StatusKind, number>
  for (const d of dice) {
    const f = faceOf(d, data)
    if (f.kind === 'status') counts[f.status]++
  }
  return counts
}

export function averageFace(type: DieType, data: GameData): number {
  const faces = facesOf(type, data)
  if (!faces.length) return 0
  return faces.reduce((s, f) => s + f.value, 0) / faces.length
}
