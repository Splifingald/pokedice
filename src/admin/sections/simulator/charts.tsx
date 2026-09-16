// Small SVG charts for the simulator. Each has a text alternative; values also appear in the tables next to them.
import { PALETTE, TYPE_COLORS } from '@/theme/colors'

const BAR = TYPE_COLORS.water

export function Histogram({ h, label = 'Histogram of player turns per battle' }: { h: Record<number, number>; label?: string }) {
  const keys = Object.keys(h).map(Number).sort((a, b) => a - b)
  if (!keys.length) return null
  const maxTurn = Math.min(40, keys[keys.length - 1]!)
  const buckets = Array.from({ length: maxTurn }, (_, i) => h[i + 1] ?? 0)
  const over = keys.filter((k) => k > maxTurn).reduce((sum, k) => sum + (h[k] ?? 0), 0)
  if (over) buckets.push(over)
  const max = Math.max(...buckets, 1)
  const W = 480
  const H = 150
  const bw = W / buckets.length
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full max-w-xl border-2 border-ink bg-panel" role="img" aria-label={label}>
      {buckets.map((c, i) => (
        <g key={i}>
          <rect x={i * bw + 1} y={H - (c / max) * (H - 8)} width={Math.max(1, bw - 2)} height={(c / max) * (H - 8)} fill={BAR} stroke={PALETTE.ink} strokeWidth={0.5}>
            <title>{`${i < maxTurn ? i + 1 : `>${maxTurn}`} turns: ${c}`}</title>
          </rect>
          {(i % 5 === 4 || i === 0) && (
            <text x={i * bw + bw / 2} y={H + 12} fontSize={10} textAnchor="middle" fill={PALETTE.ink}>
              {i < maxTurn ? i + 1 : `>${maxTurn}`}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

/** Average player turns per fight, one bar per area, over the shaded 2–4 turn band. Out-of-band bars turn gold. */
export function TurnsBars({ rows }: { rows: { name: string; avg: number; median: number }[] }) {
  if (!rows.length) return null
  const max = Math.max(6, ...rows.map((r) => Math.ceil(r.avg)))
  const W = 640
  const labelW = 200
  const barH = 18
  const gap = 6
  const plotH = rows.length * (barH + gap)
  const H = plotH + 22
  const x = (v: number) => labelW + (v / max) * (W - labelW - 44)
  const ticks = Array.from({ length: max + 1 }, (_, i) => i)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] border-2 border-ink bg-panel" role="img" aria-label="Average player turns per fight, by area">
        <rect x={x(2)} y={0} width={x(4) - x(2)} height={plotH} fill={PALETTE.hpGreen} opacity={0.2}>
          <title>Target band: 2–4 turns</title>
        </rect>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={plotH} stroke={PALETTE.shadow} strokeOpacity={0.25} />
            <text x={x(t)} y={H - 6} fontSize={11} textAnchor="middle" fill={PALETTE.ink}>
              {t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = i * (barH + gap) + gap / 2
          const off = r.avg < 2 || r.avg > 5
          return (
            <g key={r.name}>
              <text x={labelW - 6} y={y + barH * 0.75} fontSize={12} textAnchor="end" fill={PALETTE.ink}>
                {r.name}
              </text>
              <rect x={labelW} y={y} width={Math.max(1, x(r.avg) - labelW)} height={barH} fill={off ? PALETTE.gold : BAR} stroke={PALETTE.ink} strokeWidth={1}>
                <title>{`${r.name}: ${r.avg.toFixed(2)} turns on average, median ${r.median}`}</title>
              </rect>
              <text x={x(r.avg) + 4} y={y + barH * 0.75} fontSize={12} fill={PALETTE.ink}>
                {r.avg.toFixed(2)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Team average level over the run (run 1 bold, other runs faint), dashed lines where run 1 changed area. */
export function LevelChart({ runs, areaNames }: { runs: { i: number; level: number; areaId: string }[][]; areaNames: Record<string, string> }) {
  const n = Math.max(1, ...runs.map((r) => r.length))
  const W = 640
  const H = 220
  const left = 34
  const bottom = 22
  const x = (i: number) => left + (i / Math.max(1, n - 1)) * (W - left - 12)
  const y = (lv: number) => H - bottom - ((Math.min(100, Math.max(1, lv)) - 1) / 99) * (H - bottom - 10)
  const line = (pts: { i: number; level: number }[]) => {
    const step = Math.max(1, Math.ceil(pts.length / 400))
    return pts
      .filter((_, k) => k % step === 0 || k === pts.length - 1)
      .map((p) => `${x(p.i).toFixed(1)},${y(p.level).toFixed(1)}`)
      .join(' ')
  }
  const first = runs[0] ?? []
  const marks = first.filter((p, k) => k === 0 || first[k - 1]!.areaId !== p.areaId)
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[520px] border-2 border-ink bg-panel"
        role="img"
        aria-label={`Team average level over ${n} encounters${runs.length > 1 ? `, ${runs.length} runs` : ''}`}
      >
        {[1, 25, 50, 75, 100].map((lv) => (
          <g key={lv}>
            <line x1={left} x2={W - 12} y1={y(lv)} y2={y(lv)} stroke={PALETTE.shadow} strokeOpacity={0.25} />
            <text x={left - 5} y={y(lv) + 4} fontSize={11} textAnchor="end" fill={PALETTE.ink}>
              {lv}
            </text>
          </g>
        ))}
        {marks.map((p) => (
          <line key={`${p.i}-${p.areaId}`} x1={x(p.i)} x2={x(p.i)} y1={10} y2={H - bottom} stroke={PALETTE.shadow} strokeDasharray="3 3" strokeWidth={2} strokeOpacity={0.5}>
            <title>{`Encounter ${p.i + 1}: ${areaNames[p.areaId] ?? p.areaId}`}</title>
          </line>
        ))}
        {runs.map((r, k) => (
          <polyline key={k} points={line(r)} fill="none" stroke={BAR} strokeWidth={k === 0 ? 2.5 : 1.5} strokeOpacity={k === 0 ? 1 : 0.35} />
        ))}
        {[0, Math.floor(n / 2), n].map((t) => (
          <text key={t} x={x(Math.min(t, n - 1))} y={H - 6} fontSize={11} textAnchor="middle" fill={PALETTE.ink}>
            {t}
          </text>
        ))}
      </svg>
    </div>
  )
}
