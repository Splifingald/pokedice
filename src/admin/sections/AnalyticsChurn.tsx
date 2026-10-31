// Admin → Analytics → Churn by area (docs/57): where the players who stopped playing were when they left, in game
// order. The database is asked (analytics_churn, migration 0102) only when FETCH is pressed, never on its own.
import { useState } from 'react'
import { churnByArea, type Churn, type ChurnRaw } from '@/analytics/churn'
import { dayKey } from '@/analytics/retention'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { NumInput } from '../widgets'
import { errorText } from './AnalyticsPlayer'

const DAYS_MIN = 1
const DAYS_MAX = 365

async function fetchChurn(days: number, since: Date | null): Promise<ChurnRaw> {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  const { data, error } = await c.rpc('analytics_churn', {
    p_days: days,
    p_since: since ? dayKey(since) : null,
  })
  if (error) throw error
  return data as ChurnRaw
}

const pct = (share: number) => `${Math.round(share * 100)}%`
const avg = (n: number | null) =>
  n == null ? '–' : n.toLocaleString(undefined, { maximumFractionDigits: 1 })
const dayLabel = (day: string) =>
  new Date(`${day}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** What a result was fetched for: shown with it, as the settings may have moved since. */
interface Asked {
  days: number
  frame: string
}

function ChurnTable({ churn }: { churn: Churn }) {
  const width = (n: number) => `${(n / Math.max(1, churn.maxChurned)) * 100}%`
  return (
    <div className="pixel-scroll max-h-[560px] overflow-auto">
      <table className="w-full min-w-[560px] text-lg">
        <thead className="sticky top-0 bg-ink text-left uppercase text-gold">
          <tr>
            <th className="px-2 py-1">Area</th>
            <th className="w-[40%] px-2 py-1">Churned</th>
            <th className="px-2 py-1 text-right">Active</th>
            <th className="px-2 py-1 text-right">Churn</th>
            <th className="px-2 py-1 text-right" title="Average days played, churned / active">
              Days played
            </th>
          </tr>
        </thead>
        {churn.groups.map((g) => (
          <tbody key={g.regionId ?? '?'}>
            <tr>
              <th colSpan={5} scope="colgroup" className="px-2 pt-3 text-left text-xl text-gold">
                {g.name}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.areaId} className="border-t border-white/20">
                <td className="max-w-[200px] truncate px-2" title={r.areaId}>
                  {r.name}
                </td>
                <td className="px-2">
                  <span className="flex items-center gap-2">
                    <span className="h-4 flex-1" aria-hidden>
                      {r.churned > 0 && (
                        <span className="block h-full bg-gold" style={{ width: width(r.churned) }} />
                      )}
                    </span>
                    <span className="w-12 text-right">{r.churned.toLocaleString()}</span>
                  </span>
                </td>
                <td className="px-2 text-right">{r.active.toLocaleString()}</td>
                <td className="px-2 text-right">{pct(r.share)}</td>
                <td className="whitespace-nowrap px-2 text-right">
                  {avg(r.churnedDays)} / {avg(r.activeDays)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

export function ChurnByArea({ since, frame }: { since: Date | null; frame: string }) {
  const data = useGame((s) => s.rawData)
  const [days, setDays] = useState(3)
  const [result, setResult] = useState<{ churn: Churn; asked: Asked } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = Number.isInteger(days) && days >= DAYS_MIN && days <= DAYS_MAX

  const load = async () => {
    if (!valid) return
    setLoading(true)
    setError(null)
    try {
      setResult({ churn: churnByArea(await fetchChurn(days, since), data), asked: { days, frame } })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const churn = result?.churn
  const stale = result && (result.asked.days !== days || result.asked.frame !== frame)

  return (
    <section className="pixel-panel-dark flex flex-col gap-3 p-4" aria-label="Churn by area">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <span className="text-xl uppercase tracking-wider text-gold">Churn by area</span>
          <span className="text-base opacity-80">
            Where the players who stopped playing were when they left. New players of the time frame only.
          </span>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-lg leading-tight">
            Days away to count as churned
            {/* The field is `w-full` (inputCls): the box sets its width. Ink text, as the panel around is dark. */}
            <span className="w-20 shrink-0">
              <NumInput
                value={days}
                onChange={(v) => setDays(v ?? 0)}
                min={DAYS_MIN}
                max={DAYS_MAX}
                className="text-ink"
              />
            </span>
          </label>
          <PixelButton size="sm" onClick={() => void load()} disabled={loading || !valid}>
            {loading ? 'Fetching…' : 'Fetch'}
          </PixelButton>
        </div>
      </div>
      {!valid && (
        <p className="text-lg text-danger-light">
          Days away: a whole number from {DAYS_MIN} to {DAYS_MAX}.
        </p>
      )}
      {error && (
        <p className="text-lg text-danger-light">
          Could not fetch: {error}. Has supabase/migrations/0102_analytics_retention.sql been run?
        </p>
      )}
      {!churn && !error && (
        <p className="text-lg opacity-80">Press Fetch to count the churned players by area.</p>
      )}
      {churn && result && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xl">
            <span>
              <b className="text-5xl leading-none">{churn.churned.toLocaleString()}</b> churned
            </span>
            <span>
              <b>{churn.active.toLocaleString()}</b> still active
            </span>
            <span>
              Churn{' '}
              <b>
                {churn.churned + churn.active ? pct(churn.churned / (churn.churned + churn.active)) : '–'}
              </b>
            </span>
            <span>
              <b>{churn.unknown.churned.toLocaleString()}</b> churned with no known area
            </span>
          </div>
          <p className="text-base leading-snug opacity-80">
            First day in: {result.asked.frame}. Churned: last played on {dayLabel(churn.cutoff)} or before (
            {result.asked.days} day{result.asked.days === 1 ? '' : 's'} or more away, UTC). The area is where
            they were in the last hour they played (where they started their last day, for days before this
            update). Days played: the average, churned / active.
            {stale && ' The settings changed: press Fetch to count again.'}
          </p>
          {churn.groups.length ? (
            <ChurnTable churn={churn} />
          ) : (
            <p className="text-lg opacity-80">No player with a known area in this time frame.</p>
          )}
        </>
      )}
    </section>
  )
}
