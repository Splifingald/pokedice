// Admin → Analytics → Playtime (docs/57 §3.2): how long the players have played, all of them together and the time
// frame's. The database is asked (analytics_playtime, migration 0130) only when FETCH is pressed; the answer also fills
// the Playtime column of the Players table.
import { formatPlaytime } from '@/analytics/playtime'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'

export interface PlaytimeRaw {
  /** When the first seconds arrived (null: none yet). */
  since: string | null
  /** Every second counted, every player. */
  total: number
  /** player → [seconds played, hours played in over the last 7 days]. */
  rows: Record<string, [number, number]>
}

export async function fetchPlaytime(): Promise<PlaytimeRaw> {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  const { data, error } = await c.rpc('analytics_playtime')
  if (error) throw error
  const raw = (data ?? {}) as Partial<PlaytimeRaw>
  return { since: raw.since ?? null, total: Number(raw.total) || 0, rows: raw.rows ?? {} }
}

/** The time frame's players' share of it: what the page lists. */
export interface FramePlaytime {
  seconds: number
  /** Of them, the players with any time counted. */
  players: number
  hours: number
}

const sinceLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function PlaytimePanel({
  result,
  frame,
  inFrame,
  loading,
  error,
  onFetch,
}: {
  result: PlaytimeRaw | null
  frame: string
  inFrame: FramePlaytime | null
  loading: boolean
  error: string | null
  onFetch: () => void
}) {
  const counted = result ? Object.values(result.rows).filter(([s]) => s > 0).length : 0
  return (
    <section className="pixel-panel-dark flex flex-col gap-3 p-4" aria-label="Playtime">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <span className="text-xl uppercase tracking-wider text-gold">Playtime</span>
          <span className="text-base opacity-80">
            How long the players have played: all of them, and those of the time frame. Fills the Playtime
            column of the players.
          </span>
        </div>
        <span className="flex-1" />
        <PixelButton size="sm" onClick={onFetch} disabled={loading}>
          {loading ? 'Fetching…' : result ? 'Fetch again' : 'Fetch'}
        </PixelButton>
      </div>
      {error && (
        <p className="text-lg text-danger-light">
          Could not fetch: {error}. Has supabase/migrations/0130_analytics_playtime.sql been run?
        </p>
      )}
      {!result && !error && <p className="text-lg opacity-80">Press Fetch to add up the time played.</p>}
      {result && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xl">
            <span>
              <b className="text-5xl leading-none">{formatPlaytime(result.total)}</b> played in all
            </span>
            <span>
              by <b>{counted.toLocaleString()}</b> player{counted === 1 ? '' : 's'}
            </span>
            {counted > 0 && (
              <span>
                <b>{formatPlaytime(result.total / counted)}</b> each on average
              </span>
            )}
          </div>
          {inFrame && (
            <p className="text-xl">
              Players of {frame}: <b>{formatPlaytime(inFrame.seconds)}</b> by{' '}
              <b>{inFrame.players.toLocaleString()}</b>, and <b>{inFrame.hours.toLocaleString()}</b> hours
              played in over the last 7 days.
            </p>
          )}
          <p className="text-base leading-snug opacity-80">
            {result.since
              ? `Counted since ${sinceLabel(result.since)}: the time before wasn't measured.`
              : 'Nothing counted yet: the game sends it with its next hourly call.'}{' '}
            Time counts while the game is on screen and the player touched it in the last 5 minutes; it
            reaches the server with the game&apos;s next hourly call. Hrs 7d: the hours a player played in,
            whatever part of them, for the time before playtime was counted.
          </p>
        </>
      )}
    </section>
  )
}
