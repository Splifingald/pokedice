/**
 * pnpm raid-balance [raids per species=60] [seed=1]
 * Raid Battles' win rate (docs/19 §6.3): three sides of three random raid-eligible Pokémon (fully evolved, no
 * legendary, starter line or pseudo-legendary, Lv. teamCap), every side on the battle AI, against every species of the
 * raid calendar (mythicals, legendaries, pseudo-legendaries; fillers with FILLERS=1), with today's raid config. The
 * target is about 50–70 % for such a group.
 * Try changes without editing the config:
 *   BARS=3  BAR_HP=1  UPG=7  SIDE_UPG=5  START=2  PER_BREAK=2  FIELD=2  LEVEL=50  CAP=50
 */
import { BUNDLE } from '../src/config/bundle'
import { compileGameData, createRng, DEFAULT_CONFIG, npcTeam, raidEntries, raidRegion, simulateRaid, type RaidConfig } from '../src/engine'

const N = Number(process.argv[2] ?? 60)
const seed = Number(process.argv[3] ?? 1)
const env = (k: string) => (process.env[k] != null ? Number(process.env[k]) : undefined)
const base = (BUNDLE.config.events as { raid?: Partial<RaidConfig> } | undefined)?.raid ?? {}
const raid = {
  ...DEFAULT_CONFIG.events.raid,
  ...base,
  ...(env('BARS') != null && { bars: env('BARS') }),
  ...(env('BAR_HP') != null && { barHp: env('BAR_HP') }),
  ...(env('UPG') != null && { upgradeLevel: env('UPG') }),
  ...(env('SIDE_UPG') != null && { sideUpgradeLevel: env('SIDE_UPG') }),
  ...(env('START') != null && { startAllies: env('START') }),
  ...(env('PER_BREAK') != null && { summonPerBreak: env('PER_BREAK') }),
  ...(env('FIELD') != null && { maxField: env('FIELD') }),
  ...(env('LEVEL') != null && { level: env('LEVEL') }),
  ...(env('CAP') != null && { teamCap: env('CAP') }),
}
const data = compileGameData({
  ...BUNDLE,
  config: { ...BUNDLE.config, events: { ...DEFAULT_CONFIG.events, ...(BUNDLE.config.events as object), raid } },
})
const regions = data.regions.map((r) => r.id)
const rng = createRng(seed)

const rows: { name: string; kind: string; win: number; steps: number; bars: number }[] = []
const entries = raidEntries(data)
const kinds = [entries.mythical, entries.legendary, entries.pseudo, ...(process.env.FILLERS ? [entries.filler] : [])]
const seen = new Set<number>()
const raids = kinds.flat().flatMap((e) => {
  if (seen.has(e.dex)) return []
  seen.add(e.dex)
  return [{ dex: e.dex, regionId: raidRegion(data, e.areaId), kind: e.kind }]
})
for (const r of raids) {
  let wins = 0
  let steps = 0
  let bars = 0
  for (let i = 0; i < N; i++) {
    const sides = [0, 1, 2].map((k) => ({
      owner: `Side ${k + 1}`,
      look: null,
      kind: (k === 0 ? 'me' : 'npc') as 'me' | 'npc',
      team: npcTeam(data, regions, rng, `s${k}`),
    }))
    const res = simulateRaid({ boss: { dex: r.dex, shiny: false }, sides, regionId: r.regionId }, data, rng)
    if (res.won) wins++
    steps += res.steps
    bars += res.barsBroken
  }
  rows.push({ name: data.species[r.dex]?.name ?? `#${r.dex}`, kind: r.kind, win: wins / N, steps: steps / N, bars: bars / N })
}

console.log(
  `raid: bars ${raid.bars} × ${raid.barHp} HP · Lv.${raid.level} upgrades ${raid.upgradeLevel} · sides Lv.${raid.teamCap} upgrades ${raid.sideUpgradeLevel} · summons ${raid.startAllies} at start, +${raid.summonPerBreak}/bar, ${raid.maxField} max · ${N} raids each`,
)
console.log('| Raid | Win % | Actions | Bars broken |')
console.log('|---|---:|---:|---:|')
for (const r of rows) console.log(`| ${r.name} | ${Math.round(r.win * 100)} | ${r.steps.toFixed(0)} | ${r.bars.toFixed(1)} |`)
const mean = (xs: typeof rows) => Math.round((xs.reduce((n, r) => n + r.win, 0) / Math.max(1, xs.length)) * 100)
const of = (k: string) => rows.filter((r) => r.kind === k)
console.log(
  `\nMythicals ${mean(of('mythical'))} % · legendaries ${mean(of('legendary'))} % · pseudo ${mean(of('pseudo'))} %` +
    (process.env.FILLERS ? ` · fillers ${mean(of('filler'))} %` : '') +
    ` · all ${mean(rows)} %`,
)
