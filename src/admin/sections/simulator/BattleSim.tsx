// One matchup, N times, headlessly on the working copy. Both sides use the enemy reroll AI.
import { useState } from 'react'
import { createRng, effectiveStats, getSpecies, median, simulateBattle, turnsToKill, uniformLevels, type GameData, type SimResult } from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { Field, NumInput, PokemonPicker } from '../../widgets'
import { Histogram } from './charts'

interface Side {
  dex: number
  level: number
  track: number
}

interface Summary {
  n: number
  winRate: number
  draws: number
  medianTurns: number
  meanTurns: number
  medianDmg: number
  enemyMedianDmg: number
  passiveTtk: number
  histogram: Record<number, number>
}

function SidePicker({ data, label, side, onChange }: { data: GameData; label: string; side: Side; onChange: (s: Side) => void }) {
  const sp = data.species[side.dex]
  const stats = sp ? effectiveStats(sp, side.level, data) : null
  return (
    <div className="pixel-panel flex flex-col gap-2 p-3">
      <div className="text-2xl">{label}</div>
      <div className="flex items-center gap-2">
        <SpriteImg dex={side.dex} size={64} />
        <PokemonPicker className="flex-1" data={data} value={side.dex} onChange={(dex) => onChange({ ...side, dex })} />
      </div>
      <div className="flex gap-2">
        <Field label="Level">
          <NumInput className="w-24" value={side.level} min={1} max={100} onChange={(v) => onChange({ ...side, level: Math.max(1, Math.min(100, v ?? 1)) })} />
        </Field>
        <Field label="Upgrade track (all)">
          <NumInput className="w-24" value={side.track} min={1} max={10} onChange={(v) => onChange({ ...side, track: Math.max(1, Math.min(10, v ?? 1)) })} />
        </Field>
      </div>
      {stats && (
        <div className="text-base text-muted">
          HP {stats.maxHp} · {stats.dice.length} dice · {stats.rerolls} rerolls · speed {sp?.speed}
        </div>
      )}
    </div>
  )
}

export function BattleSim({ data }: { data: GameData }) {
  const [a, setA] = useState<Side>({ dex: 6, level: 40, track: 1 })
  const [b, setB] = useState<Side>({ dex: 6, level: 40, track: 1 })
  const [n, setN] = useState(1000)
  const [progress, setProgress] = useState<number | null>(null)
  const [res, setRes] = useState<Summary | null>(null)

  const run = () => {
    if (progress != null) return
    const rng = createRng((Date.now() >>> 0) ^ 0x5eed)
    const pl = uniformLevels(a.track)
    const el = uniformLevels(b.track)
    const results: SimResult[] = []
    let i = 0
    setRes(null)
    const step = () => {
      const end = Math.min(n, i + 20)
      for (; i < end; i++) results.push(simulateBattle({ dex: a.dex, level: a.level }, { dex: b.dex, level: b.level }, pl, el, data, rng))
      setProgress(i / n)
      if (i < n) {
        setTimeout(step, 0)
        return
      }
      const turns = results.map((r) => r.playerTurns)
      const histogram: Record<number, number> = {}
      for (const t of turns) histogram[t] = (histogram[t] ?? 0) + 1
      const bStats = effectiveStats(getSpecies(data, b.dex), b.level, data)
      setRes({
        n,
        winRate: results.filter((r) => r.winner === 'player').length / n,
        draws: results.filter((r) => r.winner === 'draw').length,
        medianTurns: median(turns),
        meanTurns: turns.reduce((sum, t) => sum + t, 0) / n,
        medianDmg: median(results.flatMap((r) => r.playerDamage)),
        enemyMedianDmg: median(results.flatMap((r) => r.enemyDamage)),
        passiveTtk: turnsToKill({ dex: a.dex, level: a.level }, bStats.types, bStats.maxHp, a.track, 400, data),
        histogram,
      })
      setProgress(null)
    }
    step()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-muted">One matchup played N times. Both sides use the enemy reroll AI; the player wins speed ties.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <SidePicker data={data} label="Player side" side={a} onChange={setA} />
        <SidePicker data={data} label="Opponent" side={b} onChange={setB} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Battles (N)">
          <NumInput className="w-28" value={n} min={10} max={10000} onChange={(v) => setN(Math.max(10, Math.min(10000, v ?? 1000)))} />
        </Field>
        <PixelButton variant="primary" size="lg" disabled={progress != null} onClick={run}>
          {progress != null ? `Running… ${Math.round(progress * 100)}%` : `Run ${n} battles`}
        </PixelButton>
      </div>
      {res && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['Win rate', `${(res.winRate * 100).toFixed(1)}%`],
              ['Median turns', String(res.medianTurns)],
              ['Mean turns', res.meanTurns.toFixed(2)],
              ['Median dmg / turn', String(res.medianDmg)],
              ['Opponent median dmg', String(res.enemyMedianDmg)],
              ['Stalemates', String(res.draws)],
              ['Turns to kill (passive foe)', res.passiveTtk.toFixed(2)],
              ['Battles', String(res.n)],
            ].map(([k, v]) => (
              <div key={k} className="pixel-panel p-2">
                <div className="text-base text-muted">{k}</div>
                <div className="text-3xl leading-none">{v}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xl">Player turns per battle</div>
            <Histogram h={res.histogram} />
          </div>
          <p className="text-base text-muted">Healthy fights sit in the 2–4 turn band.</p>
        </div>
      )}
    </div>
  )
}
