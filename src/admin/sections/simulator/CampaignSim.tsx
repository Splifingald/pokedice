// Whole-run simulation: a new game along the chain (Campaign) or a chosen team grinding one area (Area test).
// The real run loop from src/engine/campaign.ts runs in a Web Worker, on the unsaved working copy plus what-if overrides.
import { useMemo, useState } from 'react'
import { median, mergeAreaReports, regionSpecies, type CampaignResult, type GameConfig, type GameData } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'
import { downloadText, toCsv } from '../../csv'
import { Field, NumInput, PokemonPicker, inputCls } from '../../widgets'
import { Histogram, LevelChart, TurnsBars } from './charts'
import { useCampaignRunner, type CampaignRunner } from './runner'

// ---------------------------------------------------------------- what-if overrides

export interface WhatIf {
  hpMultiplier?: number
  goldMultiplier?: number
  encounterMode?: GameConfig['encounterMode']
  aiSamples?: number
}

/** The working copy with this simulation's overrides. The working copy itself is untouched. */
export function applyWhatIf(data: GameData, w: WhatIf): GameData {
  const config: GameConfig = { ...data.config, ai: { ...data.config.ai } }
  if (w.hpMultiplier != null) config.hpMultiplier = w.hpMultiplier
  if (w.goldMultiplier != null) config.goldMultiplier = w.goldMultiplier
  if (w.encounterMode) config.encounterMode = w.encounterMode
  if (w.aiSamples != null) config.ai.samples = Math.max(1, Math.round(w.aiSamples))
  return { ...data, config }
}

type NumericWhatIf = 'hpMultiplier' | 'goldMultiplier' | 'aiSamples'

function WhatIfPanel({ data, value, onChange }: { data: GameData; value: WhatIf; onChange: (w: WhatIf) => void }) {
  const c = data.config
  const num = (k: NumericWhatIf, label: string, now: number, step = 1, hint?: string) => (
    <Field label={label} hint={`working copy: ${now}${hint ? ` · ${hint}` : ''}`}>
      <NumInput
        nullable
        step={step}
        min={0}
        value={value[k] ?? null}
        onChange={(v) => {
          const next: WhatIf = { ...value }
          next[k] = v ?? undefined
          onChange(next)
        }}
      />
    </Field>
  )
  const overridden = Object.values(value).some((v) => v != null)
  return (
    <fieldset className="pixel-panel flex flex-col gap-2 p-3">
      <legend className="px-1 text-xl">What if…</legend>
      <p className="text-sm text-muted">Overrides for this simulation only. Leave a field empty to use the working copy's value.</p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {num('hpMultiplier', 'hpMultiplier', c.hpMultiplier, 0.05)}
        {num('goldMultiplier', 'goldMultiplier', c.goldMultiplier, 0.05)}
        <Field label="encounterMode" hint={`working copy: ${c.encounterMode}`}>
          <select
            className={inputCls}
            value={value.encounterMode ?? ''}
            onChange={(e) => onChange({ ...value, encounterMode: (e.target.value || undefined) as WhatIf['encounterMode'] })}
          >
            <option value="">(working copy)</option>
            <option value="deck">deck</option>
            <option value="random">random</option>
          </select>
        </Field>
        {num('aiSamples', 'AI samples', c.ai.samples, 10, 'lower = faster')}
      </div>
      {overridden && (
        <PixelButton size="sm" className="self-start" onClick={() => onChange({})}>
          Clear overrides
        </PixelButton>
      )}
    </fieldset>
  )
}

// ---------------------------------------------------------------- shared controls

interface Common {
  runs: number
  seed: number
  spend: boolean
  multiExp: boolean
}

const clampInt = (v: number | null, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Math.round(v ?? d)))

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center gap-2 text-lg" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

function CommonOptions({ value, onChange }: { value: Common; onChange: (c: Common) => void }) {
  return (
    <>
      <Field label="Runs" hint="seeds in a row, merged">
        <NumInput className="w-20" value={value.runs} min={1} max={10} onChange={(v) => onChange({ ...value, runs: clampInt(v, 1, 10, 1) })} />
      </Field>
      <Field label="First seed">
        <NumInput className="w-24" value={value.seed} min={1} onChange={(v) => onChange({ ...value, seed: clampInt(v, 1, 1_000_000_000, 1) })} />
      </Field>
      <Check
        label="Buy upgrades"
        checked={value.spend}
        onChange={(spend) => onChange({ ...value, spend })}
        hint="After each trainer, spend gold on the cheapest useful die or combo upgrade"
      />
      <Check label="Multi EXP" checked={value.multiExp} onChange={(multiExp) => onChange({ ...value, multiExp })} />
    </>
  )
}

function RunBar({ runner, onRun, label }: { runner: CampaignRunner; onRun: () => void; label: string }) {
  const running = runner.progress != null
  const pct = Math.round((runner.progress ?? 0) * 100)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PixelButton variant="primary" size="lg" disabled={running} onClick={onRun}>
        {running ? `Running… ${pct}%` : label}
      </PixelButton>
      {running && (
        <>
          <div className="h-3 w-48 border-2 border-ink bg-panel" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <PixelButton onClick={runner.cancel}>Cancel</PixelButton>
        </>
      )}
      {runner.error && (
        <p className="text-lg text-danger" role="alert">
          {runner.error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- report

const avgOf = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
const pct = (x: number) => Math.round(x * 100)
const fmt = (x: number, d = 1) => (Number.isInteger(x) ? String(x) : x.toFixed(d))

function histogramOf(xs: readonly number[]) {
  const h: Record<number, number> = {}
  for (const x of xs) h[x] = (h[x] ?? 0) + 1
  return h
}

export function CampaignReport({
  results,
  data,
  ms,
  regionId,
}: {
  results: CampaignResult[]
  data: GameData
  ms: number | null
  /** The region the run was in: the Pokédex tile counts out of what that region actually holds. */
  regionId?: string
}) {
  const runs = results.length
  const areas = useMemo(() => mergeAreaReports(results.map((r) => r.areas)), [results])
  const rows = useMemo(
    () =>
      areas.map((a) => {
        const v = Math.max(1, a.visits)
        const enc = Math.max(1, a.encounters)
        const avgTurns = avgOf(a.turns)
        const wipeRate = a.fights ? a.wipes / a.fights : 0
        const flags: string[] = []
        if (a.fights && avgTurns < 2) flags.push('short')
        if (avgTurns > 5) flags.push('long')
        if (wipeRate > 0.1) flags.push('hard')
        return {
          area: a.name,
          visits: a.visits,
          encounters: a.encounters / v,
          toClear: a.toClear,
          clears: a.clears,
          levelIn: a.levelIn,
          levelOut: a.levelOut,
          wild: a.kinds.wild / enc,
          trainer: a.kinds.trainer / enc,
          center: a.kinds.center / enc,
          itemShare: a.kinds.item / enc,
          gymBoss: (a.kinds.gym + a.kinds.boss) / v,
          fights: a.fights / v,
          winRate: a.fights ? a.wins / a.fights : 0,
          avgTurns,
          medianTurns: median(a.turns),
          wipes: a.wipes / v,
          stalemates: a.stalemates / v,
          gold: a.gold / v,
          catches: a.catches / v,
          fled: a.fled / v,
          items: a.itemsFound / v,
          flags,
        }
      }),
    [areas],
  )
  // Out of what this region can give you, not the National Dex — otherwise Johto looks a third finished at best.
  const dexTotal = regionId ? (regionSpecies(data, regionId).size || data.speciesList.length) : data.speciesList.length
  const allTurns = areas.flatMap((a) => a.turns)
  const sum = (k: 'fights' | 'wins' | 'wipes' | 'stalemates' | 'encounters') => areas.reduce((s, a) => s + a[k], 0)
  const fights = sum('fights')
  const end = results[0]!.end
  const upgrades = [
    ...Object.entries(end.dieLevels)
      .filter(([, l]) => l > 1)
      .map(([t, l]) => `${t} ${l}`),
    ...Object.entries(end.comboLevels)
      .filter(([, l]) => l > 1)
      .map(([k, l]) => `${k.replace(/_/g, ' ')} ${l}`),
  ].join(', ')

  const tiles: [string, string][] = [
    ['Runs', String(runs)],
    ['Encounters / run', fmt(sum('encounters') / runs)],
    ['Fights / run', fmt(fights / runs)],
    ['Win rate', fights ? `${pct(sum('wins') / fights)}%` : '—'],
    ['Wipes / run', fmt(sum('wipes') / runs)],
    ['Median turns', String(median(allTurns))],
    ['Mean turns', avgOf(allTurns).toFixed(2)],
    ['Stalemates', String(sum('stalemates'))],
    ['End team avg Lv', avgOf(results.map((r) => r.end.teamAvg)).toFixed(1)],
    ['Pokédex (avg)', `${Math.round(avgOf(results.map((r) => r.end.dex)))} / ${dexTotal}`],
    ['₽ earned / run', Math.round(avgOf(results.map((r) => r.end.goldEarned))).toLocaleString('en')],
    ['Took', ms != null ? `${(ms / 1000).toFixed(1)} s` : '—'],
  ]

  const exportCsv = () => {
    const cols = ['area', 'reached', 'encounters', 'to_clear', 'level_in', 'level_out', 'wild_pct', 'trainer_pct', 'center_pct', 'item_pct', 'gym_boss', 'fights', 'win_pct', 'avg_turns', 'median_turns', 'wipes', 'stalemates', 'pokedollars', 'catches', 'fled', 'items', 'flags']
    const out = rows.map((r) => ({
      area: r.area,
      reached: `${r.visits}/${runs}`,
      encounters: fmt(r.encounters),
      to_clear: r.toClear == null ? '' : fmt(r.toClear),
      level_in: r.levelIn.toFixed(1),
      level_out: r.levelOut.toFixed(1),
      wild_pct: pct(r.wild),
      trainer_pct: pct(r.trainer),
      center_pct: pct(r.center),
      item_pct: pct(r.itemShare),
      gym_boss: fmt(r.gymBoss),
      fights: fmt(r.fights),
      win_pct: pct(r.winRate),
      avg_turns: r.avgTurns.toFixed(2),
      median_turns: r.medianTurns,
      wipes: fmt(r.wipes),
      stalemates: fmt(r.stalemates),
      pokedollars: Math.round(r.gold),
      catches: fmt(r.catches),
      fled: fmt(r.fled),
      items: fmt(r.items),
      flags: r.flags.join(' '),
    }))
    downloadText(`pokedice-simulation-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(out, cols), 'text/csv')
  }

  const td = 'px-2 py-1 font-mono text-base tabular-nums whitespace-nowrap'
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {tiles.map(([k, v]) => (
          <div key={k} className="pixel-panel p-2">
            <div className="text-base text-muted">{k}</div>
            <div className="text-3xl leading-none">{v}</div>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-2xl">Per area</h3>
          <PixelButton size="sm" onClick={exportCsv}>
            Download CSV
          </PixelButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-lg">
            <caption className="pb-1 text-left text-base text-muted">
              Averaged per run that reached the area. Flags: short = under 2 turns a fight, long = over 5, hard = wipes on more
              than 10 % of fights.
            </caption>
            <thead>
              <tr className="bg-ink text-panel">
                {['Area', 'Reached', 'Encounters', 'To clear', 'Team Lv', 'Wild / Trainer / Center / Item', 'Gym + boss', 'Fights', 'Win', 'Avg turns', 'Median', 'Wipes', 'Caught (fled)', 'Items', '₽', 'Flags'].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.area} className="border-b-2 border-shadow/40">
                  <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                    {r.area}
                  </th>
                  <td className={td}>
                    {r.visits}/{runs}
                  </td>
                  <td className={td}>{fmt(r.encounters)}</td>
                  <td className={td}>
                    {r.toClear == null ? '—' : fmt(r.toClear)}
                    {r.toClear != null && r.clears < r.visits ? ` (${r.clears}/${r.visits})` : ''}
                  </td>
                  <td className={td}>
                    {r.levelIn.toFixed(0)} → {r.levelOut.toFixed(0)}
                  </td>
                  <td className={td}>
                    {pct(r.wild)} / {pct(r.trainer)} / {pct(r.center)} / {pct(r.itemShare)} %
                  </td>
                  <td className={td}>{r.gymBoss ? fmt(r.gymBoss) : '—'}</td>
                  <td className={td}>{fmt(r.fights)}</td>
                  <td className={td}>{r.fights ? `${pct(r.winRate)}%` : '—'}</td>
                  <td className={td}>{r.fights ? r.avgTurns.toFixed(2) : '—'}</td>
                  <td className={td}>{r.fights ? r.medianTurns : '—'}</td>
                  <td className={td}>{fmt(r.wipes)}</td>
                  <td className={td}>
                    {fmt(r.catches)} ({fmt(r.fled)})
                  </td>
                  <td className={td}>{fmt(r.items)}</td>
                  <td className={td}>{Math.round(r.gold).toLocaleString('en')}</td>
                  <td className="whitespace-nowrap px-2 py-1">
                    {r.flags.map((f) => (
                      <span key={f} className={cx('mr-1 border-2 border-ink px-1 text-base', f === 'hard' ? 'bg-danger text-panel' : 'bg-gold text-ink')}>
                        {f}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xl">Fight length by area</h3>
        <TurnsBars rows={rows.filter((r) => r.fights > 0).map((r) => ({ name: r.area, avg: r.avgTurns, median: r.medianTurns }))} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xl">Team level over the run</h3>
        <LevelChart runs={results.map((r) => r.timeline)} areaNames={Object.fromEntries(data.areas.map((a) => [a.id, a.name]))} />
        <p className="text-sm text-muted">Dashed lines: run 1 moved to a new area (hover for its name).</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-2xl">Player turns per fight</h3>
        <Histogram h={histogramOf(allTurns)} label="Histogram of player turns per fight, all areas" />
      </section>

      <section className="pixel-panel flex flex-col gap-2 p-3">
        <h3 className="text-2xl">Run 1 ended with</h3>
        <div className="flex flex-wrap items-center gap-3">
          {end.team.map((p, i) => (
            <span key={i} className="flex items-center gap-1 text-lg">
              <SpriteImg dex={p.dex} size={40} /> {p.name} Lv.{p.level}
            </span>
          ))}
        </div>
        <p className="copy text-muted">
          ₽{end.gold.toLocaleString('en')} in hand · upgrades: {upgrades || 'none'}
        </p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- tabs

export function CampaignSim({ data }: { data: GameData }) {
  // A campaign is a run through one region, so the region picks the starters it can be run with.
  const [regionId, setRegionId] = useState(data.regions[0]?.id ?? 'kanto')
  const region = data.regions.find((r) => r.id === regionId) ?? data.regions[0]
  const starters = (region?.starters ?? data.config.starters).filter((d) => data.species[d])
  const [starter, setStarter] = useState(starters[1] ?? starters[0] ?? 4)
  const [encounters, setEncounters] = useState(1500)
  const [common, setCommon] = useState<Common>({ runs: 1, seed: 1, spend: true, multiExp: true })
  const [whatIf, setWhatIf] = useState<WhatIf>({})
  const runner = useCampaignRunner()

  // Switching region moves the starter to that region's, rather than running Johto with Bulbasaur.
  const pickRegion = (id: string) => {
    setRegionId(id)
    const next = (data.regions.find((r) => r.id === id)?.starters ?? []).filter((d) => data.species[d])
    if (next.length && !next.includes(starter)) setStarter(next[1] ?? next[0]!)
  }

  const run = () =>
    runner.start(
      applyWhatIf(data, whatIf),
      { encounters, seed: common.seed, starterDex: starter, spend: common.spend, multiExp: common.multiExp, regionId },
      common.runs,
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="copy text-muted">
        Plays a new game from the starter along the chain: the encounter deck, battles with the reroll AI on both sides,
        catches, Centers and wipes. With “Buy upgrades”, trainer gold goes to the cheapest useful upgrade. Once the chain is
        clear, it grinds the endgame area. Same engine as <code>pnpm balance</code>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {data.regions.length > 1 && (
          <Field label="Region">
            <select className={inputCls} value={regionId} onChange={(e) => pickRegion(e.target.value)}>
              {data.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.enabled ? '' : ' (off)'}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Starter">
          <select className={inputCls} value={starter} onChange={(e) => setStarter(Number(e.target.value))}>
            {starters.map((d) => (
              <option key={d} value={d}>
                {data.species[d]?.name ?? `#${d}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Encounters per run" hint="1500 ≈ the whole chain">
          <NumInput className="w-28" value={encounters} min={50} max={5000} onChange={(v) => setEncounters(clampInt(v, 50, 5000, 1500))} />
        </Field>
        <CommonOptions value={common} onChange={setCommon} />
      </div>
      <WhatIfPanel data={data} value={whatIf} onChange={setWhatIf} />
      <RunBar runner={runner} onRun={run} label={`Run ${common.runs > 1 ? `${common.runs} × ` : ''}${encounters} encounters`} />
      {runner.results && <CampaignReport results={runner.results} data={data} ms={runner.ms} regionId={regionId} />}
    </div>
  )
}

export function AreaTestSim({ data }: { data: GameData }) {
  const [regionId, setRegionId] = useState(data.regions[0]?.id ?? 'kanto')
  const regionAreas = data.areas.filter((a) => (a.regionId ?? 'kanto') === regionId)
  const [areaId, setAreaId] = useState(regionAreas[2]?.id ?? regionAreas[0]?.id ?? '')
  const [team, setTeam] = useState<{ dex: number; level: number }[]>([{ dex: 4, level: 12 }])
  const [track, setTrack] = useState(1)
  const [encounters, setEncounters] = useState(200)
  const [common, setCommon] = useState<Common>({ runs: 3, seed: 1, spend: false, multiExp: true })
  const [whatIf, setWhatIf] = useState<WhatIf>({})
  const runner = useCampaignRunner()
  const area = data.areas.find((a) => a.id === areaId)

  const setMember = (k: number, patch: Partial<{ dex: number; level: number }>) => setTeam(team.map((m, j) => (j === k ? { ...m, ...patch } : m)))
  // Switching region moves to one of its areas: an area id from another region would run nothing.
  const pickRegion = (id: string) => {
    setRegionId(id)
    const next = data.areas.filter((a) => (a.regionId ?? 'kanto') === id)
    setAreaId(next[2]?.id ?? next[0]?.id ?? '')
  }
  const run = () =>
    runner.start(
      applyWhatIf(data, whatIf),
      { encounters, seed: common.seed, starterDex: team[0]?.dex ?? 4, areaId, team, track, spend: common.spend, multiExp: common.multiExp, regionId },
      common.runs,
    )

  return (
    <div className="flex flex-col gap-4">
      <p className="copy text-muted">
        A team you choose plays N encounters in one area: its deck, trainers, the gym battle or legendary once the gauge
        fills, Centers and wipes. Levels grow and catches join the team, as in the game. Good for tuning one area.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {data.regions.length > 1 && (
          <Field label="Region">
            <select className={inputCls} value={regionId} onChange={(e) => pickRegion(e.target.value)}>
              {data.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Area" className="min-w-[260px]">
          <select className={inputCls} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {regionAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.hidden ? '★ ' : `${a.orderIndex}. `}
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {area && (
          <span className="pb-1 text-lg text-muted">
            {area.scalesToTeam ? 'foes scale to the team' : `foes Lv.${area.minLevel}–${area.maxLevel}`} · {area.roundsToClear ?? '∞'} round{area.roundsToClear === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <fieldset className="pixel-panel flex flex-col gap-2 p-3">
        <legend className="px-1 text-xl">Team</legend>
        {team.map((m, k) => (
          <div key={k} className="flex flex-wrap items-end gap-2">
            <SpriteImg dex={m.dex} size={40} />
            <PokemonPicker className="min-w-[200px] flex-1" data={data} value={m.dex} onChange={(dex) => setMember(k, { dex })} />
            <Field label="Level">
              <NumInput className="w-20" value={m.level} min={1} max={100} onChange={(v) => setMember(k, { level: clampInt(v, 1, 100, 5) })} />
            </Field>
            {team.length > 1 && (
              <PixelButton size="sm" aria-label={`Remove ${data.species[m.dex]?.name ?? 'this Pokémon'}`} onClick={() => setTeam(team.filter((_, j) => j !== k))}>
                ✕
              </PixelButton>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {team.length < data.config.maxTeamSize && (
            <PixelButton size="sm" onClick={() => setTeam([...team, { dex: 25, level: team[0]?.level ?? 10 }])}>
              + Add a Pokémon
            </PixelButton>
          )}
          {area && !area.scalesToTeam && (
            <PixelButton size="sm" onClick={() => setTeam(team.map((m) => ({ ...m, level: area.maxLevel })))}>
              Set levels to the area's top (Lv.{area.maxLevel})
            </PixelButton>
          )}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Upgrade track (all)" hint="starting level of every combo and die track">
          <NumInput className="w-20" value={track} min={1} max={10} onChange={(v) => setTrack(clampInt(v, 1, 10, 1))} />
        </Field>
        <Field label="Encounters per run">
          <NumInput className="w-24" value={encounters} min={10} max={3000} onChange={(v) => setEncounters(clampInt(v, 10, 3000, 200))} />
        </Field>
        <CommonOptions value={common} onChange={setCommon} />
      </div>
      <WhatIfPanel data={data} value={whatIf} onChange={setWhatIf} />
      <RunBar runner={runner} onRun={run} label={`Run ${common.runs > 1 ? `${common.runs} × ` : ''}${encounters} encounters`} />
      {runner.results && <CampaignReport results={runner.results} data={data} ms={runner.ms} regionId={regionId} />}
    </div>
  )
}
