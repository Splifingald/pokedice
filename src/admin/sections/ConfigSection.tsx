import { useMemo, useState } from 'react'
import {
  DEFAULT_CONFIG,
  eggSpecies,
  slotOdds,
  slotReturnPerSpin,
  xpToNext,
  type DayCareConfig,
  type EnergyConfig,
  type GameConfig,
  type SlotMachineConfig,
  type SlotOutcomeKey,
  type StatusRules,
} from '@/engine'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import { cx } from '@/theme/util'
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

const SLOT_ROWS: { key: SlotOutcomeKey; balls: number; label: string }[] = [
  { key: 'oneBall', balls: 1, label: '1 Poké Ball' },
  { key: 'twoBalls', balls: 2, label: '2 Poké Balls' },
  { key: 'threeBalls', balls: 3, label: '3 Poké Balls' },
  { key: 'jackpot', balls: 0, label: '3 prize Pokémon (jackpot)' },
]

/** Game Corner (Rocket Hideout): the slot machine's price, what each result pays, and how often it comes up. */
function SlotMachineBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('slotMachine')
  const cfg: SlotMachineConfig = { ...DEFAULT_CONFIG.slotMachine, ...raw }
  const odds = slotOdds(cfg)
  const back = slotReturnPerSpin(cfg)
  const set = (patch: Partial<SlotMachineConfig>) => setRaw({ ...cfg, ...patch })
  const setOutcome = (k: SlotOutcomeKey, patch: Partial<SlotMachineConfig[SlotOutcomeKey]>) => set({ [k]: { ...cfg[k], ...patch } })
  const prize = data?.species[cfg.prizeDex]?.name ?? `#${cfg.prizeDex}`
  const pct = (x: number) => `${Math.round(x * 1000) / 10} %`
  return (
    <Box
      title="Game Corner — slot machine"
      hint="Played on the Game Corner cards (Areas → Encounter deck). The result is drawn from these weights, then the reels are laid out to show it."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cost per spin (₽)">
          <NumInput min={0} value={cfg.cost} onChange={(v) => set({ cost: Math.max(0, v ?? 0) })} />
        </Field>
        <Field label="Prize Pokémon" className="sm:col-span-2">
          {data && <PokemonPicker data={data} value={cfg.prizeDex} onChange={(dex) => set({ prizeDex: dex })} />}
        </Field>
        <Field label="Prize level">
          <NumInput min={1} max={100} value={cfg.prizeLevel} onChange={(v) => set({ prizeLevel: Math.max(1, Math.min(100, v ?? 1)) })} />
        </Field>
      </div>
      <table className="w-full text-lg">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Result</th>
            <th className="font-normal">Weight</th>
            <th className="font-normal">Chance</th>
            <th className="font-normal">Pays (₽)</th>
          </tr>
        </thead>
        <tbody>
          {SLOT_ROWS.map((r) => (
            <tr key={r.key} className="border-t border-shadow/40">
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1">
                  {r.balls
                    ? Array.from({ length: r.balls }, (_, j) => <PixelIcon key={j} name="ball" size={16} />)
                    : [0, 1, 2].map((j) => <SpriteImg key={j} dex={cfg.prizeDex} size={24} />)}
                  <span className="ml-1">{r.label}</span>
                </span>
              </td>
              <td className="pr-2">
                <NumInput className="w-24" min={0} value={cfg[r.key].weight} onChange={(v) => setOutcome(r.key, { weight: Math.max(0, v ?? 0) })} />
              </td>
              <td className="pr-2 font-mono">{pct(odds[r.key])}</td>
              <td>
                <NumInput className="w-24" min={0} value={cfg[r.key].gold} onChange={(v) => setOutcome(r.key, { gold: Math.max(0, v ?? 0) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-base text-muted">
        Weights are relative (they needn't add up to 100). The jackpot gives {prize} Lv.{cfg.prizeLevel}: it joins the team
        (or the Box), or replaces a weaker {prize} you own. Its gold is paid only when you already have {prize} at that
        level or above.
      </p>
      <p className={cx('text-lg', back >= cfg.cost ? 'text-danger' : '')}>
        Pays back <b>₽{back.toFixed(2)}</b> per ₽{cfg.cost} spin on average ({cfg.cost ? pct(back / cfg.cost) : '—'}
        ){odds.jackpot > 0 && <> · {prize} about every {Math.round(1 / odds.jackpot)} spins</>}
        {back >= cfg.cost && ' · players make money on this machine!'}
      </p>
    </Box>
  )
}

/** Energy: the cost of exploring. 1 per encounter discovered; gyms, legendaries and Pokémon Centers are free. */
function EnergyBox() {
  const [raw, setRaw] = useConfigRow('energy')
  const cfg: EnergyConfig = { ...DEFAULT_CONFIG.energy, ...raw }
  const set = (patch: Partial<EnergyConfig>) => setRaw({ ...cfg, ...patch })
  const perDay = cfg.minutesPerEnergy > 0 ? (24 * 60) / cfg.minutesPerEnergy : 0
  return (
    <Box
      title="Energy"
      hint="Each encounter discovered costs 1 (not gym / Elite / Champion battles, legendaries or Pokémon Centers). Refills in real time, offline too."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" checked={!!cfg.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> enabled
        </label>
        <Field label="Max (and start)">
          <NumInput min={1} value={cfg.max} onChange={(v) => set({ max: Math.max(1, v ?? 50) })} />
        </Field>
        <Field label="Minutes per energy">
          <NumInput min={1} value={cfg.minutesPerEnergy} onChange={(v) => set({ minutesPerEnergy: Math.max(1, v ?? 30) })} />
        </Field>
      </div>
      <p className="text-lg">
        {perDay.toFixed(1)} energy per day · empty to full in {((cfg.max * cfg.minutesPerEnergy) / 60).toFixed(1)} h
      </p>
    </Box>
  )
}

/** Pokémon Day Care: when it opens, how fast residents train, and what Eggs cost and hatch into. */
function DayCareBox() {
  const data = useAdminData()
  const [raw, setRaw] = useConfigRow('dayCare')
  const cfg: DayCareConfig = { ...DEFAULT_CONFIG.dayCare, ...raw }
  const set = (patch: Partial<DayCareConfig>) => setRaw({ ...cfg, ...patch })
  const num = (k: keyof DayCareConfig, min = 0) => (
    <NumInput min={min} value={cfg[k]} onChange={(v) => set({ [k]: Math.max(min, v ?? min) })} />
  )
  const perDay = cfg.tickMinutes > 0 ? (cfg.xpPerTick * 24 * 60) / cfg.tickMinutes : 0
  const pool = data ? eggSpecies(data) : []
  return (
    <Box title="Pokémon Day Care" hint="A secret place on the Map (not an area): Pokémon train in real time, and Eggs hatch on the spot.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opens at (Pokédex)" hint="species caught; a free Egg waits on the first visit">
          {num('unlockPokedex', 0)}
        </Field>
        <Field label="Slots">{num('slots', 1)}</Field>
        <Field label="Max XP per stay">{num('maxXp', 0)}</Field>
        <Field label="XP per tick">{num('xpPerTick', 0)}</Field>
        <Field label="Tick (minutes)">{num('tickMinutes', 1)}</Field>
        <Field label="Egg price (₽)">{num('eggPrice', 0)}</Field>
      </div>
      <p className="text-lg">
        {perDay.toFixed(1)} XP per day · the {cfg.maxXp} XP cap is reached after{' '}
        {perDay > 0 ? `${(cfg.maxXp / perDay).toFixed(1)} days` : 'never'}. Residents level up but never evolve here.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Unowned weight" hint="× odds of a species not in the Pokédex (owned = 1)">
          {num('unownedWeight', 0)}
        </Field>
        <Field label="Hatch: rank" hint="the n-th lowest level owned">
          {num('hatchRank', 1)}
        </Field>
        <Field label="Hatch: minus">{num('hatchOffset', 0)}</Field>
        <Field label="Hatch: at least">{num('hatchMinLevel', 1)}</Field>
      </div>
      <div>
        <p className="text-base text-muted">
          Eggs hatch into the first form of a line that evolves, starters excluded ({pool.length} species):
        </p>
        <div className="mt-1 flex flex-wrap gap-0.5">
          {pool.map((sp) => (
            <SpriteImg key={sp.dex} dex={sp.dex} size={32} alt={sp.name} />
          ))}
        </div>
      </div>
    </Box>
  )
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

/** Every status effect's numbers: how many faces trigger it, and what it does. Read live by battles and the help. */
function StatusRulesBox() {
  const [rules, setRules] = useConfigRow('status')
  // Per effect, so a stored row missing a newer field (e.g. burn.percentPerStack) shows the default.
  const r = Object.fromEntries(
    Object.entries(DEFAULT_CONFIG.status).map(([k, v]) => [k, { ...v, ...(rules as Partial<StatusRules> | undefined)?.[k as keyof StatusRules] }]),
  ) as unknown as StatusRules
  const patch = <K extends keyof StatusRules>(k: K, p: Partial<StatusRules[K]>) => setRules({ ...r, [k]: { ...r[k], ...p } })
  const num = (v: number | null | undefined, fallback: number, min = 0) => Math.max(min, v ?? fallback)
  const faces = 'faces needed in one roll'
  return (
    <Box title="Status effects" hint="The dice faces that trigger each effect, and what it does. The help screen and the Upgrades screen quote these numbers.">
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Burn (Fire)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.burn.threshold} min={1} onChange={(v) => patch('burn', { threshold: num(v, 1, 1) })} /></Field>
          <Field label="percentPerStack" hint="% of the victim's max HP per stack, each of its turns (min 1)"><NumInput value={r.burn.percentPerStack} min={0} onChange={(v) => patch('burn', { percentPerStack: num(v, 4) })} /></Field>
          <Field label="duration" hint="turns (refreshed by a new burn)"><NumInput value={r.burn.duration} min={1} onChange={(v) => patch('burn', { duration: num(v, 3, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Poison (Poison)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.poison.threshold} min={1} onChange={(v) => patch('poison', { threshold: num(v, 2, 1) })} /></Field>
          <Field label="percent" hint="% of the victim's max HP, each of its turns (min 1)"><NumInput value={r.poison.percent} min={0} onChange={(v) => patch('poison', { percent: num(v, 10) })} /></Field>
          <Field label="duration" hint="turns"><NumInput value={r.poison.duration} min={1} onChange={(v) => patch('poison', { duration: num(v, 3, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Frozen (Ice)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.frozen.threshold} min={1} onChange={(v) => patch('frozen', { threshold: num(v, 3, 1) })} /></Field>
          <Field label="stunTurns" hint="turns the foe skips"><NumInput value={r.frozen.stunTurns} min={1} onChange={(v) => patch('frozen', { stunTurns: num(v, 2, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Paralyze (Electric)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.paralyze.threshold} min={1} onChange={(v) => patch('paralyze', { threshold: num(v, 2, 1) })} /></Field>
          <Field label="stunTurns" hint="turns the foe skips"><NumInput value={r.paralyze.stunTurns} min={1} onChange={(v) => patch('paralyze', { stunTurns: num(v, 1, 1) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Confuse (Psychic)</legend>
          <Field label="threshold" hint={`${faces}; the foe's next attack takes recoil`}><NumInput value={r.confuse.threshold} min={1} onChange={(v) => patch('confuse', { threshold: num(v, 2, 1) })} /></Field>
          <Field label="recoilPercent" hint="% of the confused attacker's max HP it loses after its attack (min 1)"><NumInput value={r.confuse.recoilPercent} min={0} onChange={(v) => patch('confuse', { recoilPercent: num(v, 10, 0) })} /></Field>
        </fieldset>
        <fieldset className="flex flex-col gap-1 border-2 border-ink p-2">
          <legend className="px-1 text-lg">Heal (Grass)</legend>
          <Field label="threshold" hint={faces}><NumInput value={r.heal.threshold} min={1} onChange={(v) => patch('heal', { threshold: num(v, 2, 1) })} /></Field>
          <Field label="amount" hint="rollTotal: the total of the dice rolled · healFaces: the Heal faces' values">
            <Select value={r.heal.amount} options={['rollTotal', 'healFaces'] as const} onChange={(v) => patch('heal', { amount: v })} />
          </Field>
        </fieldset>
      </div>
    </Box>
  )
}

export function ConfigSection() {
  const data = useAdminData()
  const [encounterMode, setEncounterMode] = useConfigRow('encounterMode')
  const [hpMultiplier, setHpMultiplier] = useConfigRow('hpMultiplier')
  const [goldMultiplier, setGold] = useConfigRow('goldMultiplier')
  const [xpCurve, setXpCurve] = useConfigRow('xpCurve')
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
  const [multiGap, setMultiGap] = useConfigRow('multiExpGapBonus')
  const [multiMax, setMultiMax] = useConfigRow('multiExpMaxShare')
  const [xpMult, setXpMult] = useConfigRow('xpMultiplier')
  const [showRound, setShowRound] = useConfigRow('showRoundGauge')
  const [showAhead, setShowAhead] = useConfigRow('showRoundPreview')
  const [shiny, setShiny] = useConfigRow('shinyChance')
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
            <Field label="shinyChance" hint={`chance a wild Pokémon is shiny (only its sprites change) · 0.01 = 1 in 100${Number(shiny) > 0 ? ` · now 1 in ${Math.round(1 / Number(shiny))}` : ' · now off'}`}>
              <NumInput step={0.005} value={shiny} min={0} max={1} onChange={(v) => setShiny(Math.max(0, Math.min(1, v ?? 0)))} />
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
            <Field label="multiExpGapBonus" hint="+ this share per level the bench Pokémon is below the fighter (catch-up)">
              <NumInput step={0.01} value={multiGap} min={0} max={1} onChange={(v) => setMultiGap(Math.max(0, Math.min(1, v ?? 0)))} />
            </Field>
            <Field
              label="multiExpMaxShare"
              hint={`cap on the bench share (1 = as much as the fighter)${Number(multiGap) > 0 ? ` · reached ${Math.ceil(Math.max(0, Number(multiMax) - Number(multiExp)) / Number(multiGap))} levels behind` : ''}`}
            >
              <NumInput step={0.05} value={multiMax} min={0} max={1} onChange={(v) => setMultiMax(Math.max(0, Math.min(1, v ?? 1)))} />
            </Field>
          </div>
        </Box>

        <Box title="Battle">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="comboPayoutMode">
              <Select value={payout} options={['highestDamage', 'highestRank'] as const} onChange={setPayout} />
            </Field>
            <Field label="enemyUpgradeLevel" hint="foes' dice/combo upgrade level where the area (and the trainer / legendary) sets none">
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
                Pokémon, Center, legendary) and the gym badge or legendary waiting once every round is done. Needs showRoundGauge.
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

      <EnergyBox />

      <SlotMachineBox />

      <DayCareBox />

      <StatusRulesBox />

      <section className="grid gap-3 md:grid-cols-2">
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
