/**
 * pnpm area-versus-money [seeds=6] [encounters=900] [region…=every main region]
 *
 * Real-player battles (docs/54), the money side: their ₽ make the game easier too, through the upgrades they buy (the
 * simulated player spends every ₽ on its team's dice and combos after each trainer). For each region's first starter,
 * over seeds 1..n, the headless campaign runs without the card; with it at ₽ ×1.5 (as built), ×1 (a trainer's) and
 * none (XP only); and at ×1.5 with every trainer's ₽ lowered 10 % and 20 % (game_config goldMultiplier: the real
 * players' too). The real player's team is the simulated player's own at that moment (same level). Measured up to the
 * League's arrival: encounters, level, ₽ earned and the real players' share, the upgrade levels bought; then the
 * difficulty: wipes on the way, wipes at the League and how often it is cleared within the run.
 */
import { BUNDLE } from '../src/config/bundle'
import { compileGameData, runCampaignSync, type CampaignResult } from '../src/engine'

const seeds = Number(process.argv[2] ?? 6)
const N = Number(process.argv[3] ?? 900)
const gold = BUNDLE.config.goldMultiplier as number

const MODES = [
  { label: 'Off', card: false, prize: 1.5, gold: 1 },
  { label: 'On, ₽ ×1.5 (as built)', card: true, prize: 1.5, gold: 1 },
  { label: 'On, ₽ ×1 (a trainer’s)', card: true, prize: 1, gold: 1 },
  { label: 'On, no ₽ (XP only)', card: true, prize: 0, gold: 1 },
  { label: 'On, ₽ ×1.5, all trainer ₽ −10 %', card: true, prize: 1.5, gold: 0.9 },
  { label: 'On, ₽ ×1.5, all trainer ₽ −20 %', card: true, prize: 1.5, gold: 0.8 },
] as const

const dataFor = (m: (typeof MODES)[number]) =>
  compileGameData({
    ...BUNDLE,
    config: {
      ...BUNDLE.config,
      goldMultiplier: gold * m.gold,
      areaVersus: { access: m.card ? 'all' : 'off', prizeMultiplier: m.prize },
    },
  })
const sample = dataFor(MODES[0])
const regionIds = process.argv.slice(4).length ? process.argv.slice(4) : sample.regions.map((r) => r.id)

interface Tally {
  runs: number
  reached: number
  encounters: number
  level: number
  upgrades: number
  gold: number
  versusGold: number
  leagueCleared: number
  /** Each run's wipes on the way, and at the League: medians (one run stuck losing at the League would drown a mean). */
  wipes: number[]
  leagueWipes: number[]
}
const empty = (): Tally => ({
  runs: 0,
  reached: 0,
  encounters: 0,
  level: 0,
  upgrades: 0,
  gold: 0,
  versusGold: 0,
  leagueCleared: 0,
  wipes: [],
  leagueWipes: [],
})
const median = (xs: readonly number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
/** Adds one tally into another (counts summed, per-run lists joined). */
function add(into: Tally, t: Tally) {
  for (const k of Object.keys(t) as (keyof Tally)[]) {
    const v = t[k]
    if (Array.isArray(v)) (into[k] as number[]).push(...v)
    else (into[k] as number) += v
  }
}

/** A run up to the League (a run that never got there is counted apart and left out: see area-versus-balance). */
function tally(res: CampaignResult, leagueId: string, t: Tally) {
  t.runs++
  const at = res.timeline.findIndex((p) => p.areaId === leagueId)
  const league = res.areas.find((r) => r.areaId === leagueId)
  if (at < 0 || !league) return
  t.reached++
  t.encounters += at
  t.level += league.levelIn
  t.upgrades += res.timeline[at]!.upgrades
  t.leagueWipes.push(league.wipes)
  if (league.clears > 0) t.leagueCleared++
  let wipes = 0
  for (const r of res.areas) {
    if (r.areaId === leagueId) break
    t.gold += r.gold
    t.versusGold += r.versus.gold
    wipes += r.wipes
  }
  t.wipes.push(wipes)
}

const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)} %` : '—')
const diff = (a: number, b: number, digits = 1) => `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(digits)}`
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—')

const totals = MODES.map(() => empty())
const byRegion: string[] = []
for (const regionId of regionIds) {
  const region = sample.regions.find((r) => r.id === regionId)
  if (!region?.leagueAreaId) continue
  const starterDex = region.starters.find((d) => sample.species[d]) ?? 4
  const rows = MODES.map((m, i) => {
    const data = dataFor(m)
    const t = empty()
    for (let seed = 1; seed <= seeds; seed++)
      tally(
        runCampaignSync(data, {
          encounters: N,
          seed,
          starterDex,
          spend: true,
          multiExp: true,
          regionId,
          realPlayers: m.card ? { levelShift: 0 } : null,
        }),
        region.leagueAreaId!,
        t,
      )
    add(totals[i]!, t)
    return t
  })
  const off = rows[0]!
  const per = (t: Tally, n: number) => n / Math.max(1, t.reached)
  rows.forEach((t, i) => {
    byRegion.push(
      `| ${region.name} | ${MODES[i]!.label} | ${Math.round(per(t, t.gold))}${i ? ` (${delta(per(t, t.gold), per(off, off.gold))})` : ''} | ` +
        `${per(t, t.upgrades).toFixed(1)}${i ? ` (${diff(per(t, t.upgrades), per(off, off.upgrades))})` : ''} | ` +
        `${per(t, t.level).toFixed(1)}${i ? ` (${diff(per(t, t.level), per(off, off.level))})` : ''} | ` +
        `${median(t.wipes)} | ${median(t.leagueWipes)} | ${pct(t.leagueCleared, t.reached)} | ${t.reached}/${t.runs} |`,
    )
  })
}

const off = totals[0]!
const per = (t: Tally, n: number) => n / Math.max(1, t.reached)
console.log(
  `Real-player battles and money: ${seeds} seed(s), ${N} encounters a run, each region's first starter.\n`,
)
console.log('All regions together, up to the League:\n')
console.log(
  '| Card | Encounters to League | ₽ earned | ₽ per encounter | from real players | Upgrade levels bought | Lv at League | Wipes on the way (median) | Wipes at the League (median) | League cleared |',
)
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
totals.forEach((t, i) => {
  console.log(
    `| ${MODES[i]!.label} | ${per(t, t.encounters).toFixed(0)}${i ? ` (${delta(per(t, t.encounters), per(off, off.encounters))})` : ''} | ` +
      `${Math.round(per(t, t.gold))}${i ? ` (${delta(per(t, t.gold), per(off, off.gold))})` : ''} | ` +
      `${(t.gold / Math.max(1, t.encounters)).toFixed(1)}${i ? ` (${delta(t.gold / Math.max(1, t.encounters), off.gold / Math.max(1, off.encounters))})` : ''} | ${pct(t.versusGold, t.gold)} | ` +
      `${per(t, t.upgrades).toFixed(1)}${i ? ` (${diff(per(t, t.upgrades), per(off, off.upgrades))})` : ''} | ` +
      `${per(t, t.level).toFixed(1)}${i ? ` (${diff(per(t, t.level), per(off, off.level))})` : ''} | ` +
      `${median(t.wipes)} | ${median(t.leagueWipes)} | ${pct(t.leagueCleared, t.reached)} |`,
  )
})
console.log('\nBy region:\n')
console.log(
  '| Region | Card | ₽ earned | Upgrade levels | Lv at League | Wipes on the way | Wipes at the League | League cleared | Runs that got there |',
)
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|')
for (const line of byRegion) console.log(line)
