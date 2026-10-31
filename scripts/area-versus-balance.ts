/**
 * pnpm area-versus-balance [seeds=4] [encounters=900] [region…=every main region]
 *
 * Real-player battles (docs/53): what their card does to a run's XP and pace. For each region's first starter, over
 * seeds 1..n, the headless campaign (src/engine/campaign.ts, the same as `pnpm balance`) runs without the card, then
 * with it, the real player's team modelled on a player whose newest area this is: the simulated player's own team and
 * upgrades at that moment, levels shifted −10 %, 0 and +10 % (a real player's team is their last one there, often a
 * little stronger than on arrival). Everything is measured up to the League's arrival (the post-League grind would
 * drown it): encounters to get there, the team's level then, the XP earned on the way and the real players' share of
 * it, their fights and wins, and the XP per encounter in the areas that deal the card.
 */
import { BUNDLE } from '../src/config/bundle'
import { compileGameData, runCampaignSync, type CampaignResult } from '../src/engine'

const seeds = Number(process.argv[2] ?? 4)
const N = Number(process.argv[3] ?? 900)
const data = compileGameData({ ...BUNDLE, config: { ...BUNDLE.config, areaVersus: { access: 'all' } } })
const regionIds = process.argv.slice(4).length ? process.argv.slice(4) : data.regions.map((r) => r.id)

const MODES = [
  { label: 'Off', realPlayers: null },
  { label: 'On, −10 %', realPlayers: { levelShift: -0.1 } },
  { label: 'On, same level', realPlayers: { levelShift: 0 } },
  { label: 'On, +10 %', realPlayers: { levelShift: 0.1 } },
] as const

interface Tally {
  runs: number
  reached: number
  encounters: number
  level: number
  xp: number
  versusXp: number
  fights: number
  wins: number
  gold: number
  /** In the areas that deal the card: their XP and their encounters. */
  cardXp: number
  cardEncounters: number
}

/** What a run did before reaching the League (its whole run when it never got there). */
function upToLeague(res: CampaignResult, leagueId: string, cardAreas: Set<string>, t: Tally) {
  t.runs++
  const at = res.timeline.findIndex((p) => p.areaId === leagueId)
  const league = res.areas.find((r) => r.areaId === leagueId)
  if (at >= 0 && league) {
    t.reached++
    t.encounters += at
    t.level += league.levelIn
  }
  for (const r of res.areas) {
    if (r.areaId === leagueId) break
    t.xp += r.xp
    t.versusXp += r.versus.xp
    t.fights += r.versus.fights
    t.wins += r.versus.wins
    t.gold += r.gold
    if (cardAreas.has(r.areaId)) {
      t.cardXp += r.xp
      t.cardEncounters += r.encounters
    }
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—')
const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)} %` : '—')

console.log(`Real-player battles: ${seeds} seed(s), ${N} encounters a run, each region's first starter.\n`)
console.log(
  '| Region | Card | Encounters to League | Lv at League | XP before League | from real players | Real fights (won) | XP / encounter in card areas | ₽ before League |',
)
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
const totals = new Map<string, Tally>()
for (const regionId of regionIds) {
  const region = data.regions.find((r) => r.id === regionId)
  if (!region?.leagueAreaId) continue
  const starterDex = region.starters.find((d) => data.species[d]) ?? 4
  const cardAreas = new Set(data.areas.filter((a) => (a.encounterWeights.versus ?? 0) > 0).map((a) => a.id))
  let base: Tally | null = null
  for (const mode of MODES) {
    const t: Tally = {
      runs: 0,
      reached: 0,
      encounters: 0,
      level: 0,
      xp: 0,
      versusXp: 0,
      fights: 0,
      wins: 0,
      gold: 0,
      cardXp: 0,
      cardEncounters: 0,
    }
    for (let seed = 1; seed <= seeds; seed++) {
      const res = runCampaignSync(data, {
        encounters: N,
        seed,
        starterDex,
        spend: true,
        multiExp: true,
        regionId,
        realPlayers: mode.realPlayers,
      })
      upToLeague(res, region.leagueAreaId, cardAreas, t)
    }
    const all = totals.get(mode.label) ?? {
      ...t,
      runs: 0,
      reached: 0,
      encounters: 0,
      level: 0,
      xp: 0,
      versusXp: 0,
      fights: 0,
      wins: 0,
      gold: 0,
      cardXp: 0,
      cardEncounters: 0,
    }
    for (const k of Object.keys(t) as (keyof Tally)[]) all[k] += t[k]
    totals.set(mode.label, all)
    const per = (n: number) => n / Math.max(1, t.reached)
    const xpPerCardEncounter = t.cardXp / Math.max(1, t.cardEncounters)
    const row = [
      region.name,
      mode.label,
      `${per(t.encounters).toFixed(0)}${base ? ` (${delta(per(t.encounters), per(base.encounters))})` : ''}`,
      `${per(t.level).toFixed(1)}${base ? ` (${per(t.level) - per(base.level) >= 0 ? '+' : ''}${(per(t.level) - per(base.level)).toFixed(1)})` : ''}`,
      `${Math.round(per(t.xp))}${base ? ` (${delta(per(t.xp), per(base.xp))})` : ''}`,
      pct(t.versusXp, t.xp),
      t.fights ? `${(t.fights / seeds).toFixed(1)} (${pct(t.wins, t.fights)})` : '—',
      `${xpPerCardEncounter.toFixed(1)}${base ? ` (${delta(xpPerCardEncounter, base.cardXp / Math.max(1, base.cardEncounters))})` : ''}`,
      `${Math.round(per(t.gold))}${base ? ` (${delta(per(t.gold), per(base.gold))})` : ''}`,
    ]
    console.log(`| ${row.join(' | ')} |`)
    if (t.reached < t.runs)
      console.log(`|  | (${t.runs - t.reached} of ${t.runs} runs never reached the League) | | | | | | | |`)
    if (!base) base = t
  }
}

console.log('\nAll regions together:\n')
console.log(
  '| Card | Encounters to League | Lv at League | XP before League | from real players | Real fights won | XP / encounter in card areas |',
)
console.log('|---|---:|---:|---:|---:|---:|---:|')
const off = totals.get('Off')!
for (const [label, t] of totals) {
  const per = (n: number) => n / Math.max(1, t.reached)
  const offPer = (n: number) => n / Math.max(1, off.reached)
  const x = t.cardXp / Math.max(1, t.cardEncounters)
  const x0 = off.cardXp / Math.max(1, off.cardEncounters)
  console.log(
    `| ${label} | ${per(t.encounters).toFixed(0)} (${delta(per(t.encounters), offPer(off.encounters))}) | ${per(t.level).toFixed(1)} (${per(t.level) - offPer(off.level) >= 0 ? '+' : ''}${(per(t.level) - offPer(off.level)).toFixed(1)}) | ${Math.round(per(t.xp))} (${delta(per(t.xp), offPer(off.xp))}) | ${pct(t.versusXp, t.xp)} | ${pct(t.wins, t.fights)} | ${x.toFixed(1)} (${delta(x, x0)}) |`,
  )
}
