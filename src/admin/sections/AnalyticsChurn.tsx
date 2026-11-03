// Admin → Analytics → Churn by starter and area (docs/57): where the players who stopped playing were when they left,
// in game order, and which Pokémon they had picked at the very start. The database is asked (analytics_churn,
// migrations 0102 and 0129) only when FETCH is pressed, never on its own; for the players the page's who switch names
// (0135: the averages can't be split after the fact, so the database is asked again).
import { useState, type ReactNode } from 'react'
import {
  churnByArea,
  churnByStarter,
  type Churn,
  type ChurnRaw,
  type ChurnRow,
  type StarterChurn,
  type StarterChurnRow,
} from '@/analytics/churn'
import { dayKey, type Who } from '@/analytics/retention'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { getSupabase } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { NumInput } from '../widgets'
import { errorText } from './AnalyticsPlayer'
import { WHO_MIGRATION, WHO_TEXT } from './analyticsWho'

const DAYS_MIN = 1
const DAYS_MAX = 365

async function fetchChurn(days: number, since: Date | null, who: Who): Promise<ChurnRaw> {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  const args = { p_days: days, p_since: since ? dayKey(since) : null }
  // Everyone keeps the two-argument call, which works before migration 0135 too.
  const { data, error } = await c.rpc('analytics_churn', who === 'all' ? args : { ...args, p_who: who })
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
  who: Who
}

/** The columns both tables share, after the first (the area or the starter). */
function ChurnHead({ first }: { first: string }) {
  return (
    <thead className="sticky top-0 bg-ink text-left uppercase text-gold">
      <tr>
        <th className="px-2 py-1">{first}</th>
        <th className="w-[40%] px-2 py-1">Churned</th>
        <th className="px-2 py-1 text-right">Active</th>
        <th className="px-2 py-1 text-right">Churn</th>
        <th className="px-2 py-1 text-right" title="Average days played, churned / active">
          Days played
        </th>
      </tr>
    </thead>
  )
}

function ChurnCells({
  r,
  max,
  label,
}: {
  r: ChurnRow | StarterChurnRow
  /** The most churned in the table: the bars' full width. */
  max: number
  label: ReactNode
}) {
  return (
    <tr className="border-t border-white/20">
      {label}
      <td className="px-2">
        <span className="flex items-center gap-2">
          <span className="h-4 flex-1" aria-hidden>
            {r.churned > 0 && (
              <span
                className="block h-full bg-gold"
                style={{ width: `${(r.churned / Math.max(1, max)) * 100}%` }}
              />
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
  )
}

function StarterTable({ churn }: { churn: StarterChurn }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-lg" aria-label="Churn by starter">
        <ChurnHead first="Starter" />
        <tbody>
          {churn.rows.map((r) => (
            <ChurnCells
              key={r.dex}
              r={r}
              max={churn.maxChurned}
              label={
                <td className="px-2">
                  <span className="flex items-center gap-2">
                    <SpriteImg dex={r.dex} size={32} alt="" />
                    <span className="truncate" title={`#${r.dex}`}>
                      {r.name}
                    </span>
                  </span>
                </td>
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AreaTable({ churn }: { churn: Churn }) {
  return (
    <div className="pixel-scroll max-h-[560px] overflow-auto">
      <table className="w-full min-w-[560px] text-lg" aria-label="Churn by area">
        <ChurnHead first="Area" />
        {churn.groups.map((g) => (
          <tbody key={g.regionId ?? '?'}>
            <tr>
              <th colSpan={5} scope="colgroup" className="px-2 pt-3 text-left text-xl text-gold">
                {g.name}
              </th>
            </tr>
            {g.rows.map((r) => (
              <ChurnCells
                key={r.areaId}
                r={r}
                max={churn.maxChurned}
                label={
                  <td className="max-w-[200px] truncate px-2" title={r.areaId}>
                    {r.name}
                  </td>
                }
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}

export function ChurnPanel({ since, frame, who }: { since: Date | null; frame: string; who: Who }) {
  const data = useGame((s) => s.rawData)
  const [days, setDays] = useState(3)
  const [result, setResult] = useState<{ churn: Churn; starters: StarterChurn | null; asked: Asked } | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = Number.isInteger(days) && days >= DAYS_MIN && days <= DAYS_MAX

  const load = async () => {
    if (!valid) return
    setLoading(true)
    setError(null)
    try {
      const raw = await fetchChurn(days, since, who)
      setResult({
        churn: churnByArea(raw, data),
        starters: churnByStarter(raw, data),
        asked: { days, frame, who },
      })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  const churn = result?.churn
  const starters = result?.starters ?? null
  const stale =
    result && (result.asked.days !== days || result.asked.frame !== frame || result.asked.who !== who)

  return (
    <section className="pixel-panel-dark flex flex-col gap-3 p-4" aria-label="Churn">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <span className="text-xl uppercase tracking-wider text-gold">Churn by starter and area</span>
          <span className="text-base opacity-80">
            Which starter the players who stopped playing had picked, and where they were when they left. New
            players of the time frame only.
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
          Could not fetch: {error}. Has{' '}
          {who === 'all' ? 'supabase/migrations/0102_analytics_retention.sql' : WHO_MIGRATION} been run?
        </p>
      )}
      {!churn && !error && (
        <p className="text-lg opacity-80">Press Fetch to count the churned players by starter and area.</p>
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
            {starters && (
              <span>
                <b>{starters.unknown.churned.toLocaleString()}</b> churned with no known starter
              </span>
            )}
          </div>
          <p className="text-base leading-snug opacity-80">
            {WHO_TEXT[result.asked.who]}. First day in: {result.asked.frame}. Churned: last played on{' '}
            {dayLabel(churn.cutoff)} or before ({result.asked.days} day{result.asked.days === 1 ? '' : 's'} or
            more away, UTC). The area is where they were in the last hour they played (where they started
            their last day, for days before this update). The starter is the one picked at the very start, in
            Kanto (a guest's is known from their first day played after this update, or from a Kanto Pokédex
            holding only one of the three). Days played: the average, churned / active.
            {stale && ' The settings changed: press Fetch to count again.'}
          </p>
          {!starters ? (
            <p className="text-lg text-danger-light">
              Churn by starter needs supabase/migrations/0129_churn_by_starter.sql to be run.
            </p>
          ) : starters.rows.length ? (
            <StarterTable churn={starters} />
          ) : (
            <p className="text-lg opacity-80">No player with a known starter in this time frame.</p>
          )}
          {churn.groups.length ? (
            <AreaTable churn={churn} />
          ) : (
            <p className="text-lg opacity-80">No player with a known area in this time frame.</p>
          )}
        </>
      )}
    </section>
  )
}
