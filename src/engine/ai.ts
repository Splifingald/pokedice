// 01-GAME-SPEC §8 — greedy reroll heuristic, shared by wild/trainer Pokémon and the simulator.
import { comboBonus, detectCombos, longestRun } from './combos'
import { attackMultiplier, attackType, computeDamage, dieUpgradeBonus, type UpgradeLevels } from './damage'
import { dieValue, facesOf, type RolledDie } from './dice'
import type { Rng } from './rng'
import { satisfiedStatusMask } from './status'
import { COMBO_KEYS, type ComboKey, type GameData, type PokeType } from './types'

export interface AiInput {
  dice: readonly RolledDie[]
  attackerTypes: readonly PokeType[]
  defenderTypes: readonly PokeType[]
  levels: UpgradeLevels
  data: GameData
  rng: Rng
}

const same = (a: readonly boolean[], b: readonly boolean[]) => a.every((v, i) => v === b[i])

/** Keep-sets: largest matching group, a ≥3 straight draw, all dice ≥5 — each always keeping satisfied status faces. */
export function candidateKeepSets(dice: readonly RolledDie[], data: GameData): boolean[][] {
  const values = dice.map((d) => dieValue(d, data))
  const statusKeep = satisfiedStatusMask(dice, data)
  const raw: boolean[][] = []

  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let groupVal = values[0] ?? 0
  for (const [v, n] of counts) {
    const cur = counts.get(groupVal) ?? 0
    if (n > cur || (n === cur && v > groupVal)) groupVal = v
  }
  raw.push(values.map((v) => v === groupVal))

  if (longestRun(values) >= 3) {
    const distinct = [...new Set(values)].sort((a, b) => a - b)
    let bestStart = 0
    let bestLen = 1
    let start = 0
    for (let i = 1; i <= distinct.length; i++) {
      if (i < distinct.length && distinct[i] === distinct[i - 1]! + 1) continue
      if (i - start > bestLen) {
        bestLen = i - start
        bestStart = start
      }
      start = i
    }
    const run = new Set(distinct.slice(bestStart, bestStart + bestLen))
    const taken = new Set<number>()
    raw.push(
      values.map((v) => {
        if (!run.has(v) || taken.has(v)) return false
        taken.add(v)
        return true
      }),
    )
  }

  raw.push(values.map((v) => v >= 5))

  const out: boolean[][] = []
  for (const keep of raw) {
    const merged = keep.map((k, i) => k || !!statusKeep[i])
    if (merged.every(Boolean)) continue // nothing to reroll
    if (!out.some((o) => same(o, merged))) out.push(merged)
  }
  return out
}

/** Cheap Monte-Carlo estimate of final damage after rethrowing every die not in `keep`. */
export function expectedDamage(input: AiInput, keep: readonly boolean[], samples: number): number {
  const { dice, data, levels, rng } = input
  // The attack type depends on which types the dice have, not on the faces, so a reroll never changes it.
  const comboMult = attackMultiplier(attackType(dice, input.attackerTypes, input.defenderTypes, data), input.defenderTypes, data)
  const slots = dice.map((d) => {
    const bonus = dieUpgradeBonus(d.type, levels, data)
    const mult = comboMult
    const faces = facesOf(d.type, data)
    const keptValue = dieValue(d, data)
    return {
      mult,
      values: faces.map((f) => f.value),
      dmg: faces.map((f) => (f.value + bonus) * mult),
      keptValue,
      keptDmg: (keptValue + bonus) * mult,
    }
  })
  if (slots.length && slots.every((s) => s.mult === 0)) return 0
  const bonusOf = {} as Record<ComboKey, number>
  for (const k of COMBO_KEYS) bonusOf[k] = comboBonus(k, levels.comboLevels[k] ?? 1, data)
  const byRank = data.config.comboPayoutMode === 'highestRank'

  const values = new Array<number>(slots.length)
  let total = 0
  for (let s = 0; s < samples; s++) {
    let raw = 0
    for (let j = 0; j < slots.length; j++) {
      const slot = slots[j]!
      if (keep[j]) {
        values[j] = slot.keptValue
        raw += slot.keptDmg
      } else {
        const f = rng.int(0, slot.values.length - 1)
        values[j] = slot.values[f]!
        raw += slot.dmg[f]!
      }
    }
    const found = detectCombos(values) // rank order, lowest first
    let combo = 0
    if (byRank) combo = found.length ? bonusOf[found[found.length - 1]!] : 0
    else for (const k of found) if (bonusOf[k] > combo) combo = bonusOf[k]
    raw += combo * comboMult
    total += Math.max(1, Math.round(raw))
  }
  return samples ? total / samples : 0
}

/** Returns the mask of dice to reroll, or null to attack now. */
export function aiRerollMask(input: AiInput): boolean[] | null {
  const { data } = input
  const current = computeDamage(input.dice, input.attackerTypes, input.defenderTypes, input.levels, data).final
  const samples = data.config.ai.samples
  let best: { keep: boolean[]; exp: number } | null = null
  for (const keep of candidateKeepSets(input.dice, data)) {
    const exp = expectedDamage(input, keep, samples)
    if (!best || exp > best.exp) best = { keep, exp }
  }
  if (best && best.exp > current * (1 + data.config.ai.rerollGainThreshold)) return best.keep.map((k) => !k)
  return null
}
