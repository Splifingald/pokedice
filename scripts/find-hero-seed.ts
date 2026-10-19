// Finds a seed for the promo hero clip (scripts/record-hero.ts) by playing the real engine headlessly: a mediocre first
// roll (a Pair at best), two dice rerolled into a Full House, and a super-effective hit that K.O.s the foe.
//
//   pnpm exec tsx scripts/find-hero-seed.ts [--foeDex 3] [--foeLevel 50] [--playerLevel 50] [--upgradeLevel 7]
//                                           [--foeHp 120] [--from 1] [--count 200000] [--top 5]
//
// Prints the best seeds (most natural-looking first) and the harness URL of each.
import { BUNDLE } from '@/config/bundle'
import {
  activeBattler,
  compileGameData,
  computeDamage,
  createRng,
  detectCombos,
  dieValue,
  faceOf,
  reduce,
  type BattleState,
  type GameData,
  type LogEntry,
} from '@/engine'
import { HERO_DEFAULTS, heroBattle, heroBattleRng, heroQuery, type HeroOptions } from '@/dev/heroDemo'

export interface HeroPlan {
  seed: number
  /** The dice rerolled (indexes on the tray), lowest first. */
  reroll: [number, number]
  first: number[]
  final: number[]
  firstCombo: string | null
  projectedFirst: number
  damage: number
  foeHp: number
  score: number
}

const valuesOf = (s: BattleState, data: GameData) => s.dice.map((d) => dieValue(d, data))
const hasStatusFace = (s: BattleState, data: GameData) =>
  s.dice.some((d) => faceOf(d, data).kind === 'status')

/** The turn this seed plays, or null when it isn't the clip's. */
export function planFor(data: GameData, o: HeroOptions): HeroPlan | null {
  const start = heroBattle(data, o)
  if (start.phase !== 'player_roll') return null
  const rng = heroBattleRng(o.seed)
  const rolled = reduce(start, { t: 'ROLL' }, data, rng).state
  const first = valuesOf(rolled, data)
  const found = detectCombos(first)
  // A Pair at most. (Two dice rerolled can only make a Full House out of a Pair: three kept singles never can.)
  if (found.some((k) => k !== 'pair')) return null
  const me = activeBattler(rolled)
  const projected = computeDamage(rolled.dice, me.types, rolled.enemy.types, rolled.playerLevels, data)
  // The first roll must not already be enough.
  if (projected.final >= rolled.enemy.hp) return null
  const afterRoll = rng.getState()

  let best: HeroPlan | null = null
  for (let i = 0; i < first.length; i++)
    for (let j = i + 1; j < first.length; j++) {
      // Every pair of dice from the same point of the stream: the reroll draws from it whichever two are picked.
      let s = rolled
      for (const k of [i, j]) s = reduce(s, { t: 'TOGGLE_DIE', i: k }, data, createRng(0)).state
      const r = createRng(afterRoll)
      const rerolled = reduce(s, { t: 'REROLL' }, data, r).state
      const final = valuesOf(rerolled, data)
      const hit = computeDamage(rerolled.dice, me.types, rerolled.enemy.types, rerolled.playerLevels, data)
      if (hit.combo?.key !== 'full_house') continue
      const end = reduce(rerolled, { t: 'ATTACK' }, data, r)
      const dmg = end.log.find((e): e is Extract<LogEntry, { kind: 'damage' }> => e.kind === 'damage')
      if (!dmg || dmg.result.effectiveness < 1.5 || end.state.phase !== 'won') continue
      // What a viewer reads as natural play: keep the Pair, throw the two lowest others; no status face to explain;
      // a first roll that shows its Pair; a hit that doesn't overshoot by much.
      const others = first.map((v, k) => ({ v, k })).filter(({ k }) => k !== i && k !== j)
      const keptPair = others.length === 3 && new Set(others.map((x) => x.v)).size === 2
      const lowest = [...first.map((v, k) => ({ v, k }))].sort((a, b) => a.v - b.v)
      const rerolledLowest = [lowest[0]!.k, lowest[1]!.k].sort().join() === [i, j].join()
      let score = 0
      if (found.includes('pair')) score += 4
      if (keptPair) score += 2
      if (rerolledLowest) score += 3
      if (!hasStatusFace(rolled, data)) score += 2
      if (!hasStatusFace(rerolled, data)) score += 2
      // Two dice side by side read as one gesture.
      if (j === i + 1) score += 1
      score -= Math.max(0, dmg.amount - rolled.enemy.hp) / 20
      const plan: HeroPlan = {
        seed: o.seed,
        reroll: [i, j],
        first,
        final,
        firstCombo: found.includes('pair') ? 'pair' : null,
        projectedFirst: projected.final,
        damage: dmg.amount,
        foeHp: rolled.enemy.hp,
        score,
      }
      if (!best || plan.score > best.score) best = plan
    }
  return best
}

function args(): { o: HeroOptions; from: number; count: number; top: number } {
  const argv = process.argv.slice(2)
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] != null ? Number(argv[i + 1]) : null
  }
  const o = { ...HERO_DEFAULTS }
  for (const key of Object.keys(HERO_DEFAULTS) as (keyof HeroOptions)[]) {
    const v = get(key)
    if (v != null && Number.isFinite(v)) (o as Record<keyof HeroOptions, number | null>)[key] = v
  }
  return { o, from: get('from') ?? 1, count: get('count') ?? 200_000, top: get('top') ?? 5 }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('find-hero-seed.ts')
if (isMain) {
  const { o, from, count, top } = args()
  const data = compileGameData(BUNDLE)
  const plans: HeroPlan[] = []
  for (let seed = from; seed < from + count; seed++) {
    const p = planFor(data, { ...o, seed })
    if (p) plans.push(p)
  }
  plans.sort((a, b) => b.score - a.score || a.seed - b.seed)
  const foe = data.species[o.foeDex]?.name
  const me = data.species[o.playerDex]?.name
  console.log(
    `${me} Lv.${o.playerLevel} vs ${foe} Lv.${o.foeLevel}: ${plans.length} of ${count} seeds play the clip.`,
  )
  for (const p of plans.slice(0, top))
    console.log(
      `seed ${p.seed}  score ${p.score.toFixed(2)}  first [${p.first}] (${p.firstCombo ?? 'no combo'}, ${p.projectedFirst} dmg)` +
        `  reroll dice ${p.reroll.map((k) => k + 1).join('+')}  →  [${p.final}] Full House, ${p.damage} dmg vs ${p.foeHp} HP` +
        `\n    /__demo/hero?${heroQuery({ ...o, seed: p.seed })}`,
    )
  if (!plans.length) process.exitCode = 1
}
