/**
 * pnpm snowglobe-balance [encounters=400] [seeds=3]
 * Snowglobe Valley's chain on the headless campaign (src/engine/campaign.ts, as Haunted Hollow was checked: docs/26
 * §2.4): each starter over seeds 1..n, the world's XP ×1.5, Ice ×1.2 and its own upgrade tracks. One row per area: the
 * team's level arriving, fights, wipes, and how many runs cleared it, so the curve can be read at a glance (docs/64 §5).
 */
import { BUNDLE } from '../src/config/bundle'
import { compileGameData, mergeAreaReports, runCampaignSync, type AreaReport } from '../src/engine'
import { REGION_ID, STARTERS, withSnowglobe } from './content-snowglobe-valley'

const N = Number(process.argv[2] ?? 400)
const seeds = Number(process.argv[3] ?? 3)
const data = compileGameData(withSnowglobe(BUNDLE))

const runs: AreaReport[][] = []
for (const starterDex of STARTERS)
  for (let seed = 1; seed <= seeds; seed++)
    runs.push(
      runCampaignSync(data, {
        encounters: N,
        seed,
        starterDex,
        spend: true,
        multiExp: true,
        regionId: REGION_ID,
      }).areas,
    )

const chain = data.areas.filter((a) => a.regionId === REGION_ID && !a.hidden)
const merged = mergeAreaReports(runs)
console.log(`${STARTERS.length} starters × ${seeds} seeds, ${N} encounters each\n`)
console.log('| Area | Lv. | Arriving Lv. (avg) | Fights | Wipes | Runs that cleared it |')
console.log('|---|---|---:|---:|---:|---:|')
for (const a of chain) {
  const mine = runs.map((r) => r.find((x) => x.areaId === a.id)).filter((x): x is AreaReport => !!x)
  const m = merged.find((x) => x.areaId === a.id)
  const lv = mine.length ? (mine.reduce((s, r) => s + r.levelIn, 0) / mine.length).toFixed(1) : '—'
  console.log(
    `| ${a.name} | ${a.minLevel}–${a.maxLevel} | ${lv} | ${m?.fights ?? 0} | ${m?.wipes ?? 0} | ${mine.filter((r) => r.clears > 0).length}/${runs.length} |`,
  )
}
