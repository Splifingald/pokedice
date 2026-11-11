// Admin → Live events → a Community Boss (docs/71 §4.5): the boss (a species, shiny or not), its HP gauges in the order
// they break (HP, colour, the reward every participant gets), and the estimate of how long each would take. After its
// end, the rewards can be sent by hand (the scheduled function does it every 5 minutes on the published site). No
// switch of its own (the user's call, 2026-11-11): scheduling one is turning it on.
import { useState } from 'react'
import {
  BOSS_COLORS,
  BOSS_COLOR_HEX,
  BOSS_MAX_GAUGES,
  bossEstimate,
  bossTotalHp,
  liveState,
  type BossColor,
  type GameData,
  type LiveEvent,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { Field, NumInput, PokemonPicker, inputCls } from '../widgets'
import { RewardFields, RewardKindSelect } from './CalendarBox'

type Boss = LiveEvent['boss']

const fmt = (n: number) => Math.round(n).toLocaleString('en')
function hours(h: number): string {
  if (!Number.isFinite(h)) return '—'
  if (h < 48) return `${Math.round(h * 10) / 10} h`
  return `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`
}

/** Its settings, with the estimate under the gauges. */
export function BossEditor({
  e,
  set,
  data,
}: {
  e: LiveEvent
  set: (boss: Boss) => void
  data: GameData | null
}) {
  const b = e.boss
  const [trainers, setTrainers] = useState(50)
  const [avgHit, setAvgHit] = useState(60)
  const [sent, setSent] = useState<string | null>(null)
  const items = data ? Object.values(data.items).sort((a, x) => a.name.localeCompare(x.name)) : []
  const est = bossEstimate(e, trainers, avgHit)
  const span = (Date.parse(e.end) - Date.parse(e.start)) / 3_600_000
  const setGauge = (i: number, patch: Partial<Boss['gauges'][number]>) =>
    set({ ...b, gauges: b.gauges.map((g, k) => (k === i ? { ...g, ...patch } : g)) })
  const settle = async () => {
    setSent('Sending…')
    try {
      const c = await getSupabase()
      if (!c) throw new Error('Supabase client unavailable')
      const { data: r, error } = await c.rpc('boss_settle', { p_event: e.id })
      if (error) throw error
      const x = r as { broken: number; sent: number; participants: number; again: boolean }
      setSent(
        x.again
          ? `Already sent: ${x.broken} gauges broken, ${x.sent} messages.`
          : `${x.broken} gauges broken by ${x.participants} trainers: ${x.sent} messages sent.`,
      )
    } catch (err) {
      setSent(`Failed: ${(err as Error).message}`)
    }
  }
  return (
    <div className="grid gap-4">
      {data && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col text-base">
            The boss
            <PokemonPicker data={data} value={b.dex} onChange={(dex) => set({ ...b, dex })} />
          </label>
          <label className="flex min-h-[34px] items-center gap-1.5 text-lg">
            <input
              type="checkbox"
              checked={b.shiny}
              onChange={(ev) => set({ ...b, shiny: ev.target.checked })}
            />
            Shiny
          </label>
          <span className="text-base text-muted">It never attacks. Runs once (no repeat).</span>
        </div>
      )}
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="m-0 text-xl font-normal">HP gauges</h4>
          <span className="text-base text-muted">
            {b.gauges.length} · {fmt(bossTotalHp(e))} HP in all · broken in this order
          </span>
          <PixelButton
            size="sm"
            className="ml-auto"
            disabled={b.gauges.length >= BOSS_MAX_GAUGES}
            onClick={() =>
              set({
                ...b,
                gauges: [
                  ...b.gauges,
                  {
                    hp: b.gauges[b.gauges.length - 1]?.hp ?? 10_000_000,
                    color: BOSS_COLORS[b.gauges.length % BOSS_COLORS.length]!,
                    reward: { kind: 'gold', amount: 5000 },
                  },
                ],
              })
            }
          >
            + Gauge
          </PixelButton>
        </div>
        {data && (
          <ol className="m-0 grid list-none gap-2 p-0">
            {b.gauges.map((g, i) => (
              <li key={i} className="flex flex-wrap items-end gap-2 border-t-2 border-line pt-2">
                <span className="pb-1 text-lg" style={{ color: BOSS_COLOR_HEX[g.color] }}>
                  ■ {i + 1}.
                </span>
                <label className="flex w-36 flex-col text-base">
                  HP
                  <NumInput
                    value={g.hp}
                    min={1}
                    max={9_999_999_999}
                    step={1_000_000}
                    onChange={(v) => setGauge(i, { hp: Math.max(1, Math.round(v ?? 1)) })}
                  />
                </label>
                <label className="flex w-28 flex-col text-base">
                  Colour
                  <select
                    className={inputCls}
                    value={g.color}
                    aria-label={`Gauge ${i + 1}: colour`}
                    onChange={(ev) => setGauge(i, { color: ev.target.value as BossColor })}
                  >
                    {BOSS_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-36 flex-col text-base">
                  Reward
                  <RewardKindSelect
                    r={g.reward}
                    set={(reward) => setGauge(i, { reward })}
                    label={`Gauge ${i + 1}: reward kind`}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <RewardFields
                    r={g.reward}
                    set={(reward) => setGauge(i, { reward })}
                    data={data}
                    items={items}
                  />
                </div>
                <span className="pb-1 text-sm text-muted" data-testid={`boss-est-${i}`}>
                  ≈ {hours(est[i]!)}
                </span>
                <PixelButton
                  size="sm"
                  onClick={() => set({ ...b, gauges: b.gauges.filter((_, k) => k !== i) })}
                  aria-label={`Gauge ${i + 1}: delete`}
                >
                  Delete
                </PixelButton>
              </li>
            ))}
          </ol>
        )}
      </section>
      <fieldset className="grid gap-2 border-2 border-line p-2">
        <legend className="px-1 text-lg">Estimate</legend>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Trainers taking part" hint="Each places 3 Pokémon, all the time.">
            <NumInput
              value={trainers}
              min={1}
              max={100_000}
              onChange={(v) => setTrainers(Math.max(1, v ?? 1))}
            />
          </Field>
          <Field label="Average hit" hint="Level × affinity: Lv.50 neutral is 50, Lv.60 super effective 120.">
            <NumInput value={avgHit} min={1} max={400} onChange={(v) => setAvgHit(Math.max(1, v ?? 1))} />
          </Field>
        </div>
        <p className="m-0 text-base" data-testid="boss-estimate">
          {fmt(trainers * 3 * 400 * avgHit)} damage an hour: every gauge broken in about{' '}
          {hours(est[est.length - 1] ?? Infinity)}
          {Number.isFinite(span) && span > 0 ? ` (the event lasts ${hours(span)})` : ''}.
        </p>
      </fieldset>
      {liveState(e, Date.now()) === 'ended' && (
        <div className="flex flex-wrap items-center gap-2">
          <PixelButton size="sm" onClick={() => void settle()}>
            Send the rewards now
          </PixelButton>
          <span className="text-base text-muted" role="status">
            {sent ?? 'Sent by itself within 5 minutes of the end on the published site; once only.'}
          </span>
        </div>
      )}
    </div>
  )
}
