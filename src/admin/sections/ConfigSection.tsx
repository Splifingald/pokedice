import { useMemo, useState } from 'react'
import { DEFAULT_CONFIG, xpToNext, type GameConfig } from '@/engine'
import { SpriteImg } from '@/components/SpriteImg'
import { DataTable } from '../DataTable'
import { addRows, rowKey, updateRow, useAdmin, useAdminData } from '../store'
import { Box, Field, NumInput, PokemonPicker, inputCls } from '../widgets'

function useConfigRow<K extends keyof GameConfig>(key: K): [GameConfig[K], (v: GameConfig[K]) => void] {
  const rows = useAdmin((st) => st.rows.game_config)
  const row = rows.find((r) => r.key === key)
  const value = (row ? row.value : DEFAULT_CONFIG[key]) as GameConfig[K]
  const set = (v: GameConfig[K]) => {
    if (row) updateRow('game_config', rowKey('game_config', row), { value: v })
    else addRows('game_config', [{ key, value: v }])
  }
  return [value, set]
}

function XpPlot({ A, B, C, fightsPerHour, mult }: { A: number; B: number; C: number; fightsPerHour: number; mult: number }) {
  const W = 360
  const H = 160
  const cfg = { ...DEFAULT_CONFIG, xpCurve: { A, B, C } }
  const pts = Array.from({ length: 100 }, (_, i) => xpToNext(i + 1, cfg))
  const max = Math.max(...pts)
  const path = pts.map((v, i) => `${(i / 99) * W},${H - (v / max) * (H - 14)}`).join(' ')
  const perHour = (L: number) => (fightsPerHour * L * mult) / xpToNext(L, cfg)
  return (
    <div className="flex flex-wrap items-start gap-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm border-2 border-ink bg-panel" role="img" aria-label="XP to next level by level">
        <polyline points={path} fill="none" stroke="#547acc" strokeWidth={2} />
        <text x={4} y={12} fontSize={10} fill="#2a2438">
          xpToNext(L), L = 1…100 (max {max})
        </text>
      </svg>
      <table className="text-lg">
        <thead>
          <tr>
            <th className="pr-3 text-left font-normal">Level</th>
            <th className="pr-3 text-left font-normal">XP to next</th>
            <th className="text-left font-normal">≈ levels / hour</th>
          </tr>
        </thead>
        <tbody>
          {[5, 10, 20, 35, 50, 80].map((L) => (
            <tr key={L}>
              <td>{L}</td>
              <td className="font-mono">{xpToNext(L, cfg)}</td>
              <td className="font-mono">{perHour(L).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="w-full text-sm text-muted">
        Estimate: {fightsPerHour} K.O.s per hour against foes of your own level (XP per K.O. = the foe's level × {mult}),
        fighter share.
      </p>
    </div>
  )
}

function Select<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}

function JsonField<K extends keyof GameConfig>({ k }: { k: K }) {
  const [value, set] = useConfigRow(k)
  const [text, setText] = useState(() => JSON.stringify(value, null, 1))
  const [err, setErr] = useState<string | null>(null)
  return (
    <Field label={k} hint={err ?? undefined}>
      <textarea
        className={`${inputCls} h-32 font-mono text-xs`}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          try {
            set(JSON.parse(e.target.value))
            setErr(null)
          } catch {
            setErr('invalid JSON — not applied')
          }
        }}
      />
    </Field>
  )
}

export function ConfigSection() {
  const data = useAdminData()
  const [encounterMode, setEncounterMode] = useConfigRow('encounterMode')
  const [hpMultiplier, setHpMultiplier] = useConfigRow('hpMultiplier')
  const [goldMultiplier, setGold] = useConfigRow('goldMultiplier')
  const [xpCurve, setXpCurve] = useConfigRow('xpCurve')
  const [regen, setRegen] = useConfigRow('regenPercentPerHour')
  const [share, setShare] = useConfigRow('xpShareMode')
  const [skip, setSkip] = useConfigRow('skipPolicy')
  const [noEscape, setNoEscape] = useConfigRow('noEscape')
  const [payout, setPayout] = useConfigRow('comboPayoutMode')
  const [enemyLv, setEnemyLv] = useConfigRow('enemyUpgradeLevel')
  const [maxTurns, setMaxTurns] = useConfigRow('maxBattleTurns')
  const [starters, setStarters] = useConfigRow('starters')
  const [starterLevel, setStarterLevel] = useConfigRow('starterLevel')
  const [spread, setSpread] = useConfigRow('scaleLevelSpread')
  const [voluntary, setVoluntary] = useConfigRow('allowVoluntarySwitch')
  const [forced, setForced] = useConfigRow('forcedCenterWhenHurt')
  const [version] = useConfigRow('configVersion')
  const [multiExp, setMultiExp] = useConfigRow('multiExpShare')
  const [xpMult, setXpMult] = useConfigRow('xpMultiplier')
  const [showRound, setShowRound] = useConfigRow('showRoundGauge')
  const [showAhead, setShowAhead] = useConfigRow('showRoundPreview')
  const [fph, setFph] = useState(80)
  const curve = useMemo(() => ({ ...DEFAULT_CONFIG.xpCurve, ...xpCurve }), [xpCurve])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl">Config</h2>
        <span className="text-lg">content version {String(version)} (bumped by Publish)</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Pacing & rewards" hint="Fight length, levelling speed and money. Damage always equals the dice.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="hpMultiplier" hint="× every Pokémon's HP, yours and foes' — the fight-length knob">
              <NumInput step={0.05} value={hpMultiplier} min={0.1} onChange={(v) => setHpMultiplier(Math.max(0.1, v ?? 1))} />
            </Field>
            <Field label="xpMultiplier" hint="× the XP a K.O. gives (foe's level × this) — to the Pokémon and to the area's exploration alike">
              <NumInput step={0.25} value={xpMult} min={0.1} onChange={(v) => setXpMult(Math.max(0.1, v ?? 1))} />
            </Field>
            <Field label="goldMultiplier" hint="× trainer gold — the economy knob">
              <NumInput step={0.1} value={goldMultiplier} onChange={(v) => setGold(v ?? 1)} />
            </Field>
            <Field label="regenPercentPerHour" hint="passive healing, % of max HP per real hour">
              <NumInput value={regen} onChange={(v) => setRegen(v ?? 0)} />
            </Field>
          </div>
        </Box>

        <Box title="Encounters" hint="How much each card counts is set per area (Areas → Encounter deck).">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="encounterMode" hint="deck: each area deals a shuffled deck (exact mix, no long droughts) · random: independent rolls">
              <Select value={encounterMode} options={['deck', 'random'] as const} onChange={setEncounterMode} />
            </Field>
            <Field label="skipPolicy" hint="FLEE on the encounter pop-up: free, once per encounter, or never">
              <Select value={skip} options={['free', 'once', 'none'] as const} onChange={setSkip} />
            </Field>
            <Field label="scaleLevelSpread" hint="areas that scale to the team: its average ± this">
              <NumInput value={spread} onChange={(v) => setSpread(v ?? 3)} />
            </Field>
            <label className="flex items-center gap-2 text-lg" title="Players can't FLEE / AVOID an encounter or RUN from a battle (overrides skipPolicy)">
              <input type="checkbox" checked={!!noEscape} onChange={(e) => setNoEscape(e.target.checked)} /> noEscape
            </label>
            <label className="flex items-center gap-2 text-lg" title="The first encounter of an area is a Center when anyone is hurt">
              <input type="checkbox" checked={!!forced} onChange={(e) => setForced(e.target.checked)} /> forcedCenterWhenHurt
            </label>
          </div>
        </Box>

        <Box title="XP sharing">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="xpShareMode" hint="fighter: the Pokémon that fought · team: all three">
              <Select value={share} options={['fighter', 'team'] as const} onChange={setShare} />
            </Field>
            <Field label="multiExpShare" hint="Multi EXP: bench share of K.O. XP (0 = off; players can toggle)">
              <NumInput step={0.05} value={multiExp} min={0} max={1} onChange={(v) => setMultiExp(Math.max(0, Math.min(1, v ?? 0)))} />
            </Field>
          </div>
        </Box>

        <Box title="Battle">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="comboPayoutMode">
              <Select value={payout} options={['highestDamage', 'highestRank'] as const} onChange={setPayout} />
            </Field>
            <Field label="enemyUpgradeLevel" hint="upgrade track level of every wild/trainer Pokémon">
              <NumInput value={enemyLv} min={1} max={10} onChange={(v) => setEnemyLv(v ?? 1)} />
            </Field>
            <Field label="maxBattleTurns" hint="stalemate safety valve">
              <NumInput value={maxTurns} onChange={(v) => setMaxTurns(v ?? 150)} />
            </Field>
            <label className="flex items-center gap-2 text-lg" title="Switching on your own turn (it costs the turn)">
              <input type="checkbox" checked={!!voluntary} onChange={(e) => setVoluntary(e.target.checked)} /> allowVoluntarySwitch
            </label>
          </div>
        </Box>

        <Box title="Player help" hint="What the game shows players while they plan.">
          <label className="flex items-start gap-2 text-lg">
            <input type="checkbox" className="mt-1.5" checked={!!showRound} onChange={(e) => setShowRound(e.target.checked)} />
            <span>
              showRoundGauge
              <span className="block text-sm text-muted">
                The round gauge on the area screen: one segment per card of the area's deck, with an icon for each encounter
                already met this round. Rounds (and their opening Pokémon Center) happen either way.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-lg">
            <input type="checkbox" className="mt-1.5" checked={!!showAhead} onChange={(e) => setShowAhead(e.target.checked)} />
            <span>
              showRoundPreview
              <span className="block text-sm text-muted">
                Under the round gauge, show what's ahead: an icon for each card still in the deck (battle, find, wild
                Pokémon, Center, legendary) and the gym badge or legendary waiting at the full gauge. Needs showRoundGauge.
              </span>
            </span>
          </label>
        </Box>
      </div>

      <section>
        <h3 className="text-2xl">XP curve — xpToNext(L) = ⌈A·L^B⌉ + C</h3>
        <div className="mb-2 flex flex-wrap gap-3">
          {(['A', 'B', 'C'] as const).map((k) => (
            <Field key={k} label={k}>
              <NumInput className="w-24" step={k === 'B' ? 0.05 : 1} value={curve[k]} onChange={(v) => setXpCurve({ ...curve, [k]: v ?? 0 })} />
            </Field>
          ))}
          <Field label="K.O.s per hour (estimate)">
            <NumInput className="w-24" value={fph} onChange={(v) => setFph(v ?? 60)} />
          </Field>
        </div>
        <XpPlot A={curve.A} B={curve.B} C={curve.C} fightsPerHour={fph} mult={xpMult ?? 1} />
      </section>

      <section>
        <h3 className="text-2xl">Starters</h3>
        <div className="flex flex-wrap items-center gap-2">
          {data &&
            starters.map((d, i) => (
              <div key={i} className="flex items-center gap-1">
                <SpriteImg dex={d} size={36} />
                <PokemonPicker className="w-64" data={data} value={d} onChange={(x) => setStarters(starters.map((y, j) => (j === i ? x : y)))} />
              </div>
            ))}
          <Field label="starterLevel">
            <NumInput className="w-20" value={starterLevel} onChange={(v) => setStarterLevel(v ?? 5)} />
          </Field>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <JsonField k="status" />
        <JsonField k="ai" />
        <JsonField k="startInventory" />
      </section>

      <section>
        <DataTable
          table="game_config"
          title="All game_config rows"
          newRow={() => ({ key: `newKey${Date.now().toString(36)}`, value: null })}
          columns={[
            { key: 'key', label: 'Key', kind: 'text' },
            { key: 'value', label: 'Value (JSON)', kind: 'json', nullable: true },
          ]}
        />
      </section>
    </div>
  )
}
