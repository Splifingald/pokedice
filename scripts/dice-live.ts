/**
 * Dice for a new region, on the patterns the live game actually uses (docs/08-UNOVA-PLAN.md §2c).
 *
 * `dicePlan()` in seed.ts is the v1.8 formula, and the live database has moved away from it: Sinnoh's 107 species were
 * retuned by hand in the admin (64 of them no longer match), and Johto and Hoenn agree with Sinnoh where it matters.
 * This module is those tuned rows read back as rules, so Unova starts where the others were taken to rather than
 * where they started. It only writes rows for the range being generated; nothing here touches an existing species.
 *
 * The shape, in short:
 * - a first stage has 2 dice (1 when weak, BST < 300, with a base die at Lv.6–8), and a 3rd around ten levels before
 *   a late evolution; a weak one's base die turns into its type a few levels before it evolves (Hoenn, Kanto)
 * - a middle stage has 3, its base die turning into the second type (or the main one) at Lv.24
 * - a 3-stage final has 4 and a 5th at Lv.50; the dual-typed ones carry no base die at all
 * - a 2-stage final has 3 + [36–40, 50], or 4 + [50] when it evolves at Lv.37 or later (and for revived fossils)
 * - a non-evolver has 2, reaching 5 by Lv.50 when strong (BST ≥ 450)
 * - legendaries have 5: a trio 3 typed + 2 base, a box legendary or a mythical 5 typed
 * - rerolls = dice on arrival, +1 with every die added later
 */
import type { DiceEntry, DieType, Milestone, PokeType } from '../src/engine/types'

export type LegendKind = 'trio' | 'box' | 'mythical'

export interface LiveDiceInput {
  dex: number
  type1: PokeType
  type2: PokeType | null
  bst: number
  /** 1 = first stage. */
  stage: number
  /** Stages in the whole line (1 = never evolves). */
  lineLength: number
  /** Level this species evolves at, or `null` when it evolves by item or not at all. */
  evolvesAt: number | null
  /** True when it evolves by item (a stone, or a trade item). */
  evolvesByItem: boolean
  /** Level its pre-evolution becomes it at (null for a first stage or an item evolution). */
  arrivesAt: number | null
  starter: boolean
  /** A 3-stage line that levels up slowly into a 600-BST final (Gible's shape). */
  pseudo: boolean
  /** Revived from a fossil: the final comes out stronger, as Hoenn's and Sinnoh's do. */
  fossil: boolean
  legend: LegendKind | null
}

export interface LiveDicePlan {
  dice: DiceEntry[]
  rerolls: number
  milestones: Milestone[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The level a first-stage Pokémon gets its 2nd die at when it starts with one: weaker ones wait longer. */
const weakSecondDie = (bst: number) => (bst < 260 ? 8 : bst < 280 ? 7 : 6)

/** An evolution this game levels towards: a stone / trade item counts as Lv.30, the level the others are assigned. */
const effectiveEvolution = (s: LiveDiceInput): number | null => s.evolvesAt ?? (s.evolvesByItem ? 30 : null)

function group(dice: DieType[]): DiceEntry[] {
  const out: DiceEntry[] = []
  for (const t of dice) {
    const e = out.find((d) => d.type === t)
    if (e) e.count += 1
    else out.push({ type: t, count: 1 })
  }
  // Typed dice first, the base die last, as every existing row lists them.
  return out.sort((a, b) => (a.type === 'base' ? 1 : 0) - (b.type === 'base' ? 1 : 0))
}

interface Draft {
  start: DieType[]
  adds: [level: number, type: DieType][]
  replaces: [level: number, from: DieType, to: DieType][]
}

function draft(s: LiveDiceInput): Draft {
  const t1: DieType = s.type1
  const t2: DieType | null = s.type2
  const other: DieType = t2 ?? t1
  const evo = effectiveEvolution(s)

  if (s.legend === 'trio') return { start: t2 ? [t1, t1, t2, 'base', 'base'] : [t1, t1, t1, 'base', 'base'], adds: [], replaces: [] }
  if (s.legend) return { start: t2 ? [t1, t1, t1, t2, t2] : [t1, t1, t1, t1, t1], adds: [], replaces: [] }

  // ---- never evolves
  if (s.lineLength === 1) {
    const start: DieType[] = t2 ? [t1, t2] : [t1, t1]
    if (s.bst >= 450) return { start, adds: [[24, other], [40, 'base'], [50, t1]], replaces: [] }
    if (s.bst >= 440) return { start, adds: [[20, t1], [40, other]], replaces: [] }
    if (s.bst >= 400) return { start, adds: [[20, t1]], replaces: [] }
    return { start, adds: [], replaces: [] }
  }

  // ---- first stage
  if (s.stage === 1) {
    if (s.starter) return { start: [t1, t1], adds: [], replaces: [] }
    if (s.bst < 300 && !s.pseudo) {
      const adds: Draft['adds'] = [[weakSecondDie(s.bst), 'base']]
      const replaces: Draft['replaces'] = []
      // A late evolver waits long enough on two dice that it gets a third (Chingling, Finneon, Bonsly, Numel).
      if (evo != null && evo >= 30) adds.push([clamp(evo - 10, 20, 28), t1])
      // Hoenn and Kanto turn the early base die into the type a few levels before the Pokémon evolves.
      else if (s.evolvesAt != null && s.evolvesAt >= 18) replaces.push([clamp(s.evolvesAt - 5, 14, 20), 'base', other])
      return { start: [t1], adds, replaces }
    }
    const start: DieType[] = t2 ? [t1, t2] : [t1, t1]
    // Evolving at Lv.26 or later: a third die about a dozen levels before (Buizel 18, Stunky 20, Skorupi 24).
    if (s.evolvesAt != null && s.evolvesAt >= 26) return { start, adds: [[clamp(s.evolvesAt - 12, 18, 26), t2 ? t1 : 'base']], replaces: [] }
    // A stone evolver can be kept as it is for as long as the player likes (Riolu, Munchlax, Aipom: a 3rd at ~20).
    if (s.evolvesByItem) return { start, adds: [[20, t2 ? t1 : 'base']], replaces: [] }
    return { start, adds: [], replaces: [] }
  }

  // ---- middle of a 3-stage line
  if (s.lineLength >= 3 && s.stage === 2) {
    const start: DieType[] = s.starter || !t2 ? [t1, t1, 'base'] : [t1, t2, 'base']
    const replaceAt = Math.max(24, (s.arrivesAt ?? 20) + 4)
    const adds: Draft['adds'] = []
    // A long wait for the last stage earns a die on the way (Gabite 40, Pupitar 42).
    if (s.evolvesAt != null && s.evolvesAt >= 45) adds.push([clamp(s.evolvesAt - 8, 40, 50), t1])
    if (s.pseudo) return { start: t2 ? [t1, t1, t2] : [t1, t1, t1], adds, replaces: [] }
    // A middle stage that grows a die on the way keeps its base die, as Gabite and Pupitar do.
    return { start, adds, replaces: adds.length ? [] : [[replaceAt, 'base', other]] }
  }

  // ---- final of a 3-stage line
  if (s.lineLength >= 3) {
    const start: DieType[] = t2 ? [t1, t1, t2, t2] : s.bst >= 535 ? [t1, t1, t1, t1] : [t1, t1, t1, 'base']
    return { start, adds: [[s.pseudo ? 55 : 50, t1]], replaces: [] }
  }

  // ---- final of a 2-stage line
  if (s.bst < 430) {
    const first = clamp((s.arrivesAt ?? 20) + 6, 20, 30)
    return { start: t2 ? [t1, t2] : [t1, t1], adds: [[first, t1], [40, other]], replaces: [] }
  }
  const arrival = s.arrivesAt
  if (s.fossil || (arrival != null && arrival >= 37)) {
    const start: DieType[] = t2 ? (s.bst >= 500 ? [t1, t1, t2, t2] : [t1, t1, t2, 'base']) : [t1, t1, t1, 'base']
    return { start, adds: [[50, other]], replaces: [] }
  }
  const start: DieType[] = t2 ? [t1, t1, t2] : [t1, t1, 'base']
  const second = arrival == null ? 40 : arrival <= 25 ? 36 : arrival <= 34 ? 38 : 40
  if (s.bst < 450) return { start, adds: [[second, other]], replaces: [] }
  return { start, adds: [[second, t2 ?? t1], [50, t1]], replaces: [] }
}

/** Dice, rerolls and the level milestones (ADD_DIE + ADD_REROLL pairs, REPLACE_DIE, EVOLVE) for one new species. */
export function liveDicePlan(s: LiveDiceInput): LiveDicePlan {
  const d = draft(s)
  const milestones: Milestone[] = []
  for (const [level, dieType] of d.adds) {
    milestones.push({ level, effect: 'ADD_DIE', dieType }, { level, effect: 'ADD_REROLL', amount: 1 })
  }
  for (const [level, fromDieType, dieType] of d.replaces) milestones.push({ level, effect: 'REPLACE_DIE', dieType, fromDieType })
  if (s.evolvesAt != null) milestones.push({ level: s.evolvesAt, effect: 'EVOLVE' })
  return { dice: group(d.start), rerolls: s.legend ? 5 : d.start.length, milestones }
}
