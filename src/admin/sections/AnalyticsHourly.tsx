// Admin → Analytics → Players per hour: how many different players played in each of the last 24 hours
// (analytics_hourly, migration 0041). The database is asked only when the button is pressed, never on its own.
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase } from '@/lib/supabase'
import { PALETTE } from '@/theme/colors'
import { cx } from '@/theme/util'
import { errorText } from './AnalyticsPlayer'

interface Hour {
  start: Date
  players: number
  guests: number
  /** False for the hours before the counting started (the migration's first day). */
  recorded: boolean
}

interface Hourly {
  hours: Hour[]
  /** Different players over the 24 hours. */
  total: number
  /** The first hour ever recorded. */
  since: Date | null
}

async function fetchHourly(): Promise<Hourly> {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  const { data, error } = await c.rpc('analytics_hourly')
  if (error) throw error
  const raw = (data ?? {}) as {
    hours?: [string, number, number][] | null
    total?: number
    since?: string | null
  }
  const since = raw.since ? new Date(raw.since) : null
  return {
    hours: (raw.hours ?? []).map(([at, players, guests]) => {
      const start = new Date(at)
      return { start, players, guests, recorded: since != null && start >= since }
    }),
    total: raw.total ?? 0,
    since,
  }
}

/** The hour's start in the admin's own clock: 14:00. */
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const span = (h: Hour) => `${time(h.start)} – ${time(new Date(h.start.getTime() + 3_600_000))}`

/** A clean y scale: about four steps of 1, 2 or 5 × 10ⁿ, whole numbers only. */
function axis(top: number) {
  const raw = Math.max(top, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!,
  )
  const max = Math.max(step, Math.ceil(top / step) * step)
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) }
}

/** The hour in progress is striped: its count is still growing. */
const NOW_FILL = `repeating-linear-gradient(135deg, ${PALETTE.gold} 0 4px, transparent 4px 7px)`

function Chart({ data }: { data: Hourly }) {
  const [hover, setHover] = useState<number | null>(null)
  const { hours } = data
  const last = hours.length - 1
  const { max, ticks } = axis(Math.max(0, ...hours.map((h) => h.players)))
  const peak = hours.reduce<Hour | null>((best, h) => (h.players > (best?.players ?? 0) ? h : best), null)
  const now = hours[last]
  const h = hover == null ? null : hours[hover]
  const pct = (n: number) => `${(n / max) * 100}%`

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xl">
        <span>
          <b className="text-5xl leading-none">{data.total.toLocaleString()}</b> different players
        </span>
        {peak && (
          <span>
            Peak <b>{peak.players.toLocaleString()}</b> at {time(peak.start)}
          </span>
        )}
        {now && (
          <span>
            This hour so far <b>{now.players.toLocaleString()}</b>
          </span>
        )}
      </div>
      {data.since && hours[0] && data.since > hours[0].start && (
        <p className="text-base opacity-80">
          Counting started at {time(data.since)} on {data.since.toLocaleDateString()}: the hours before are
          not recorded.
        </p>
      )}

      <div className="flex gap-2 pt-8">
        <div className="relative h-48 w-8 shrink-0 text-right text-base leading-none opacity-80" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: pct(t) }}>
              {t.toLocaleString()}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative h-48"
            role="img"
            aria-label={`Players per hour over the last 24 hours${peak ? `: peak ${peak.players} at ${time(peak.start)}` : ''}. The table below has every hour.`}
          >
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px bg-white/20" style={{ bottom: pct(t) }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
              {hours.map((x, i) => (
                <div
                  key={x.start.getTime()}
                  className={cx('flex h-full flex-1 items-end justify-center', hover === i && 'bg-white/10')}
                  onMouseEnter={() => setHover(i)}
                >
                  {x.recorded && x.players > 0 && (
                    <div
                      className={cx('w-full max-w-[24px]', i !== last && 'bg-gold')}
                      style={{ height: pct(x.players), background: i === last ? NOW_FILL : undefined }}
                    />
                  )}
                </div>
              ))}
            </div>
            {h && hover != null && (
              <div
                className={cx(
                  'light-scope pointer-events-none absolute z-10 whitespace-nowrap bg-panel px-2 py-1 text-base leading-tight text-ink shadow-halo',
                  hover < 4 ? 'left-0' : hover > last - 4 ? 'right-0' : '-translate-x-1/2',
                )}
                style={{
                  bottom: `calc(${pct(h.recorded ? h.players : 0)} + 6px)`,
                  left:
                    hover >= 4 && hover <= last - 4 ? `${((hover + 0.5) / hours.length) * 100}%` : undefined,
                }}
              >
                <b>{span(h)}</b>
                {hover === last && ' (so far)'}
                <br />
                {h.recorded
                  ? `${h.players.toLocaleString()} players · ${h.guests.toLocaleString()} guests`
                  : 'Not recorded yet'}
              </div>
            )}
          </div>
          <div className="relative mt-1 flex h-5 gap-[2px] text-base leading-none opacity-80" aria-hidden>
            {hours.map((x, i) => (
              <span key={x.start.getTime()} className="relative flex-1">
                {(last - i) % 3 === 0 && (
                  <span
                    className={cx(
                      'absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
                      (last - i) % 6 !== 0 && 'hidden sm:inline',
                    )}
                  >
                    {time(x.start)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-base opacity-80">
        A player counts in each hour they play in (a save change or opening the game). Striped: the hour in
        progress.
      </p>

      <details className="text-lg">
        <summary className="cursor-pointer">Table</summary>
        <table className="mt-1 w-full max-w-lg">
          <thead className="text-left uppercase text-gold">
            <tr>
              <th className="px-2">Hour</th>
              <th className="px-2 text-right">Players</th>
              <th className="px-2 text-right">Signed in</th>
              <th className="px-2 text-right">Guests</th>
            </tr>
          </thead>
          <tbody>
            {[...hours].reverse().map((x) => (
              <tr key={x.start.getTime()} className="border-t border-white/20">
                <td className="whitespace-nowrap px-2">{span(x)}</td>
                {x.recorded ? (
                  <>
                    <td className="px-2 text-right">{x.players.toLocaleString()}</td>
                    <td className="px-2 text-right">{(x.players - x.guests).toLocaleString()}</td>
                    <td className="px-2 text-right">{x.guests.toLocaleString()}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-2 text-right opacity-80">
                    not recorded
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

export function HourlyPlayers() {
  const [data, setData] = useState<Hourly | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchHourly())
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="pixel-panel-dark flex flex-col gap-3 p-4" aria-label="Players per hour">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <span className="text-xl uppercase tracking-wider text-gold">Players per hour</span>
          <span className="text-base opacity-80">The last 24 hours, in your time zone</span>
        </div>
        <span className="flex-1" />
        <PixelButton size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Counting…' : data ? 'Check again' : 'Check'}
        </PixelButton>
      </div>
      {error && (
        <p className="text-lg text-danger-light">
          Could not count: {error}. Has supabase/migrations/0041_player_hours.sql been run?
        </p>
      )}
      {!data && !error && (
        <p className="text-lg opacity-80">Press Check to count the players of the last 24 hours.</p>
      )}
      {data && <Chart data={data} />}
    </section>
  )
}
