// Read-only summaries that help players plan: an area's main types.
import { type Area, type GameData, type PokeType, type Trainer } from './types'

export interface AreaTypeProfile {
  /** 1–3 most common types among the foes you'll meet (wild + trainers), most common first. Empty = too mixed. */
  main: PokeType[]
  /** share of each type among those foes (0..1) */
  shares: Partial<Record<PokeType, number>>
}

interface Foe {
  types: PokeType[]
  w: number
}

function foesOf(area: Area, data: GameData): Foe[] {
  const foes: Foe[] = []
  const typesOf = (dex: number): PokeType[] | null => {
    const s = data.species[dex]
    return s ? (s.type2 ? [s.type1, s.type2] : [s.type1]) : null
  }
  const w = area.encounterWeights
  const wildTotal = area.wildPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
  const trainerTotal = area.trainerPool.reduce((sum, e) => sum + Math.max(0, e.weight), 0)
  const fightTotal = (wildTotal ? w.wild : 0) + (trainerTotal ? w.trainer : 0)
  if (wildTotal && fightTotal) {
    const share = w.wild / fightTotal
    for (const e of area.wildPool) {
      const types = typesOf(e.dex)
      if (types && e.weight > 0) foes.push({ types, w: (e.weight / wildTotal) * share })
    }
  }
  if (trainerTotal && fightTotal) {
    const share = w.trainer / fightTotal
    for (const e of area.trainerPool) {
      const t = data.trainers[e.trainerId]
      if (!t?.team.length || e.weight <= 0) continue
      for (const m of t.team) {
        const types = typesOf(m.dex)
        if (types) foes.push({ types, w: ((e.weight / trainerTotal) * share) / t.team.length })
      }
    }
  }
  return foes
}

export function areaTypeProfile(area: Area, data: GameData): AreaTypeProfile {
  const foes = foesOf(area, data)
  const total = foes.reduce((sum, f) => sum + f.w, 0)
  if (!total) return { main: [], shares: {} }
  const acc = new Map<PokeType, number>()
  for (const f of foes) for (const t of f.types) acc.set(t, (acc.get(t) ?? 0) + f.w / f.types.length)
  const shares = Object.fromEntries([...acc].map(([t, v]) => [t, v / total])) as Partial<Record<PokeType, number>>
  const ranked = [...acc.keys()].sort((a, b) => (shares[b] ?? 0) - (shares[a] ?? 0))
  // 2–3 main types: keep those with a real presence; a very spread-out area (catch-all) reads as "mixed".
  let main = ranked.filter((t) => (shares[t] ?? 0) >= 0.12).slice(0, 3)
  if (main.length < 2 && (shares[ranked[0]!] ?? 0) >= 0.12) main = ranked.slice(0, 2)
  return { main, shares }
}

/**
 * A trainer's specialty: its most represented type (a primary type counts 1, a secondary ½; ties go to the type more
 * of its Pokémon carry), shown only when it makes up at least `minShare` of the team — a mixed team (Champion Blue)
 * has none.
 */
export function trainerSpecialty(t: Trainer, data: GameData, minShare = 0.4): PokeType | null {
  const count = new Map<PokeType, number>()
  const carriers = new Map<PokeType, number>()
  let total = 0
  for (const m of t.team) {
    const s = data.species[m.dex]
    if (!s) continue
    count.set(s.type1, (count.get(s.type1) ?? 0) + 1)
    carriers.set(s.type1, (carriers.get(s.type1) ?? 0) + 1)
    total += 1
    if (s.type2) {
      count.set(s.type2, (count.get(s.type2) ?? 0) + 0.5)
      carriers.set(s.type2, (carriers.get(s.type2) ?? 0) + 1)
      total += 0.5
    }
  }
  let best: PokeType | null = null
  for (const [type, n] of count) {
    const bestN = best ? count.get(best)! : -1
    if (n > bestN || (n === bestN && carriers.get(type)! > carriers.get(best!)!)) best = type
  }
  return best && count.get(best)! / total >= minShare ? best : null
}
