/**
 * pnpm sim — headless balance check.
 *  1. Simulates 1000 random battles (must not throw).
 *  2. Reproduces the 01-GAME-SPEC §2.3 turns-to-kill table as a regression check on the engine.
 *  3. Prints mirror-match win rates and the effect of a good / bad type matchup.
 */
import { BUNDLE } from '../src/config/bundle'
import {
  compileGameData,
  createRng,
  effectiveStats,
  getSpecies,
  simulateBattle,
  simulateMany,
  turnsToKill,
  uniformLevels,
} from '../src/engine'

const data = compileGameData(BUNDLE)
const rng = createRng(2026)

let t0 = Date.now()
let decided = 0
for (let i = 0; i < 1000; i++) {
  const p = data.speciesList[rng.int(0, data.speciesList.length - 1)]!
  const e = data.speciesList[rng.int(0, data.speciesList.length - 1)]!
  const r = simulateBattle(
    { dex: p.dex, level: rng.int(5, 70) },
    { dex: e.dex, level: rng.int(5, 70) },
    uniformLevels(rng.int(1, 10)),
    uniformLevels(1),
    data,
    rng,
  )
  if (r.winner !== 'draw') decided++
}
console.log(`✓ 1000 random battles in ${Date.now() - t0} ms — ${decided} decided, ${1000 - decided} draws`)

const rows: [string, number, number][] = [
  ['Charmander L5', 4, 5],
  ['Charmeleon L20', 5, 20],
  ['Charizard L40', 6, 40],
  ['Charizard L60', 6, 60],
  ['Snorlax L50', 143, 50],
  ['Mewtwo L80', 150, 80],
]
const tracks = [1, 3, 5, 7, 10]
const table = (method: 'perRoll' | 'battle', n: number, title: string) => {
  t0 = Date.now()
  console.log(`\n${title}`)
  console.log('Matchup'.padEnd(16), 'HP'.padStart(4), ...tracks.map((t) => `trk${t}`.padStart(7)))
  for (const [label, dex, level] of rows) {
    const stats = effectiveStats(getSpecies(data, dex), level, data)
    // A typeless target is truly neutral (×1 for every die) — "mirror" is about HP, not typing.
    const cells = tracks.map((t) =>
      turnsToKill({ dex, level }, [], stats.maxHp, t, n, data, 7, method).toFixed(1).padStart(7),
    )
    console.log(label.padEnd(16), String(stats.maxHp).padStart(4), ...cells)
  }
  console.log(`(${Date.now() - t0} ms)`)
}
table('perRoll', 2500, 'Spec §2.3 methodology — HP ÷ mean damage of one roll with the full reroll budget')
table('battle', 800, 'Played out — whole turns, one reroll budget per battle (§2.1)')

console.log('\nMirror matches, both at track 1 (win rate should be ~50 %):')
for (const [label, dex, level] of rows.slice(1, 4)) {
  const s = simulateMany({ dex, level }, { dex, level }, 1, 1, 500, data, 11)
  console.log(`  ${label.padEnd(16)} win ${(s.winRate * 100).toFixed(0)}%  median turns ${s.medianTurns}`)
}

console.log('\nType matchups (Lv.30, track 3) — turns to kill:')
const neutral = turnsToKill({ dex: 9, level: 30 }, ['normal'], 100, 3, 1500, data)
const good = turnsToKill({ dex: 9, level: 30 }, ['fire'], 100, 3, 1500, data)
const bad = turnsToKill({ dex: 9, level: 30 }, ['grass'], 100, 3, 1500, data)
console.log(`  Blastoise vs neutral ${neutral.toFixed(2)} · vs Fire ${good.toFixed(2)} · vs Grass ${bad.toFixed(2)}`)
