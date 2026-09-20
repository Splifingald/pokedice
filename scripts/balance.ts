/**
 * pnpm balance [encounters=1500] [seed=1] [region=kanto]
 * "Simulated run": the same headless campaign as the admin Simulator's Campaign tab (src/engine/campaign.ts) —
 * encounters, battles (greedy AI on both sides), rewards, catches, wipes, upgrades — reporting fight length per area.
 * If average fights drift above ~5 player turns, trainers are paying too little gold (see goldMultiplier) or HP is too
 * high (hpMultiplier).
 */
import { BUNDLE } from '../src/config/bundle'
import { compileGameData, median, regionSpecies, runCampaignSync, type Species } from '../src/engine'

const N = Number(process.argv[2] ?? 1500)
const seed = Number(process.argv[3] ?? 1)
// A campaign is a run through one region. `all` runs each in turn, which is how the three curves get compared.
const regionArg = process.argv[4] ?? process.env.REGION ?? 'kanto'
// Try pacing changes without editing content:
//   GOLD=0.8          trainer gold multiplier
//   HP=1.6            hpMultiplier (× every Pokémon's HP)
//   DIE_BONUS=0.5     scales every die-upgrade bonus      COMBO_BONUS=0.5   scales every combo bonus
//   LESS_DICE=1       drops that many base dice from each species (never below one die)
const override = {
  ...(process.env.GOLD ? { goldMultiplier: Number(process.env.GOLD) } : {}),
  ...(process.env.HP ? { hpMultiplier: Number(process.env.HP) } : {}),
}
const dieF = Number(process.env.DIE_BONUS ?? 1)
const comboF = Number(process.env.COMBO_BONUS ?? 1)
const lessDice = Number(process.env.LESS_DICE ?? 0)
const scaleBonus = <T extends { bonus: number }>(rows: T[], f: number) => rows.map((r) => ({ ...r, bonus: Math.round(r.bonus * f) }))
function dropBaseDice(dice: Species['dice']): Species['dice'] {
  let drop = lessDice
  let total = dice.reduce((n, d) => n + d.count, 0)
  return dice
    .map((d) => {
      if (d.type !== 'base' || drop <= 0) return d
      const take = Math.min(drop, d.count, total - 1)
      drop -= take
      total -= take
      return { ...d, count: d.count - take }
    })
    .filter((d) => d.count > 0)
}
const data = compileGameData({
  ...BUNDLE,
  config: { ...BUNDLE.config, ...override },
  upgrades: { combos: scaleBonus(BUNDLE.upgrades.combos, comboF), dice: scaleBonus(BUNDLE.upgrades.dice, dieF) },
  pokemon: lessDice ? BUNDLE.pokemon.map((p) => ({ ...p, dice: dropBaseDice(p.dice) })) : BUNDLE.pokemon,
})

const regionIds = regionArg === 'all' ? data.regions.map((r) => r.id) : [regionArg]

const levels = (rec: Record<string, number>) =>
  Object.entries(rec)
    .filter(([, l]) => l > 1)
    .map(([k, l]) => `${k} ${l}`)
    .join(', ') || 'none'

for (const regionId of regionIds) {
  const region = data.regions.find((r) => r.id === regionId)
  if (!region) throw new Error(`Unknown region ${regionId} (have ${data.regions.map((r) => r.id).join(', ')})`)
  const starter = region.starters.find((d) => data.species[d]) ?? 4
  const res = runCampaignSync(data, { encounters: N, seed, starterDex: starter, spend: true, multiExp: true, regionId })

  console.log(
    `\n═══ ${region.name} — ${N} encounters, seed ${seed}, starter ${data.species[starter]?.name}, ` +
      `goldMultiplier ${data.config.goldMultiplier}, hpMultiplier ${data.config.hpMultiplier}\n`,
  )
  console.log(
    'Area'.padEnd(36),
    'fights'.padStart(7),
    'win%'.padStart(6),
    'avg turns'.padStart(10),
    'median'.padStart(7),
    'wipes'.padStart(6),
    'gold'.padStart(7),
    'lv in→out'.padStart(11),
  )
  for (const r of res.areas) {
    if (!r.fights) continue
    const avg = r.turns.reduce((s, t) => s + t, 0) / r.fights
    console.log(
      r.name.slice(0, 35).padEnd(36),
      String(r.fights).padStart(7),
      `${Math.round((r.wins / r.fights) * 100)}`.padStart(6),
      avg.toFixed(2).padStart(10),
      String(median(r.turns)).padStart(7),
      String(r.wipes).padStart(6),
      String(r.gold).padStart(7),
      `${r.levelIn.toFixed(0)}→${r.levelOut.toFixed(0)}`.padStart(11),
    )
  }
  const { end } = res
  const fights = res.areas.reduce((n, r) => n + r.fights, 0)
  const wipes = res.areas.reduce((n, r) => n + r.wipes, 0)
  const catchable = regionSpecies(data, regionId).size
  console.log(
    `\nEnd: team ${end.team.map((p) => `${p.name} L${p.level}`).join(', ')} · avg L${end.teamAvg.toFixed(1)} · ` +
      `gold ${end.gold} · dex ${end.dex}/${catchable} · wipe rate ${((wipes / Math.max(1, fights)) * 100).toFixed(1)}%`,
  )
  console.log(`Upgrades: ${levels(end.dieLevels)} · combos ${levels(end.comboLevels)}`)
}
