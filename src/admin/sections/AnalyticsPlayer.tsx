// Admin → Analytics: average playtime, and one player's stats (daily playtime + their latest snapshot).
import { useEffect, useMemo, useState } from 'react'
import type { PlayerSnapshot } from '@/analytics/events'
import {
  dayKey,
  formatDuration,
  type AveragePlaytime,
  type PlaytimeEvent,
  dailySeconds,
} from '@/analytics/playtime'
import { AreaBanner } from '@/components/AreaBanner'
import { PixelIcon } from '@/components/icons'
import { SpriteImg } from '@/components/SpriteImg'
import { getSupabase } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { LeaderboardBan } from './LeaderboardBan'
import { PlayerCheats } from './PlayerCheats'

const BAR = '#4aa84a'

export function PlaytimeHero({ avg }: { avg: AveragePlaytime | null }) {
  return (
    <section
      className="pixel-panel-dark flex flex-col justify-center gap-1 p-4"
      aria-label="Average daily playtime"
    >
      <span className="text-xl uppercase tracking-wider text-gold">Avg daily playtime</span>
      <span className="text-7xl leading-none sm:text-8xl">
        {avg == null ? '…' : avg.perPlayerDay == null ? '–' : formatDuration(avg.perPlayerDay)}
      </span>
      <p className="text-base leading-snug opacity-80">
        {avg && avg.playerDays > 0
          ? `Per player, on the days they played · ${avg.playerDays} player-day${avg.playerDays > 1 ? 's' : ''}, ${formatDuration(avg.totalSeconds)} in total`
          : 'Time with the game open and in use (idle after 2 min), per player per day played.'}
      </p>
    </section>
  )
}

/** The latest snapshot of a player (key = user id, or "device:<id>" for guests). */
async function fetchSnapshot(player: string): Promise<{ at: string; snap: PlayerSnapshot } | null> {
  const client = await getSupabase()
  if (!client) return null
  let q = client.from('analytics_events').select('created_at,params').eq('kind', 'snapshot')
  q = player.startsWith('device:')
    ? q.is('user_id', null).eq('device_id', player.slice(7))
    : q.eq('user_id', player)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1)
  if (error) throw error
  const row = data?.[0] as { created_at: string; params: PlayerSnapshot } | undefined
  return row ? { at: row.created_at, snap: row.params } : null
}

/** One bar per day of the period (up to 90), minutes played; hover for the exact figure. */
function DailyPlaytimeChart({ days }: { days: { day: string; seconds: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(60, ...days.map((d) => d.seconds))
  const label = (k: string) =>
    new Date(`${k}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const h = hover != null ? days[hover] : null
  return (
    <div>
      <div className="flex items-baseline justify-between text-base text-muted">
        <span>Minutes played per day</span>
        <span aria-live="polite" className="text-ink">
          {h
            ? `${label(h.day)}: ${h.seconds ? formatDuration(h.seconds) : 'no play'}`
            : `max ${formatDuration(max)}`}
        </span>
      </div>
      <div
        className="relative flex h-32 items-end gap-[2px] border-b-2 border-shadow"
        role="img"
        aria-label={`Daily playtime over ${days.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full min-w-0 flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            title={`${label(d.day)}: ${d.seconds ? formatDuration(d.seconds) : 'no play'}`}
          >
            <div
              className="w-full"
              style={{
                height: d.seconds ? `${Math.max(3, (d.seconds / max) * 100)}%` : 0,
                background: BAR,
                borderRadius: '4px 4px 0 0',
                opacity: hover == null || hover === i ? 1 : 0.55,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-sm text-muted">
        <span>{days[0] && label(days[0].day)}</span>
        <span>{days.length > 1 && label(days[days.length - 1]!.day)}</span>
      </div>
    </div>
  )
}

function Block({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col gap-2 border-2 border-ink bg-panel p-3', className)}>
      <h4 className="text-xl leading-none">{title}</h4>
      {children}
    </div>
  )
}

/** Stats for the selected player: playtime over the period, and where their game stands now. */
export function PlayerPanel({
  player,
  name,
  playtime,
  from,
  to,
}: {
  player: string
  name: string
  playtime: PlaytimeEvent[]
  from: Date | null
  to: Date | null
}) {
  const data = useGame((s) => s.data)
  const [snap, setSnap] = useState<{ at: string; snap: PlayerSnapshot } | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setSnap(undefined)
    setErr(null)
    fetchSnapshot(player)
      .then((s) => live && setSnap(s))
      .catch((e: unknown) => live && setErr(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [player])

  const days = useMemo(() => {
    const per = dailySeconds(playtime, player)
    const mine = playtime.filter((e) => e.player === player)
    const first = from ?? (mine.length ? new Date(Math.min(...mine.map((e) => e.at.getTime()))) : new Date())
    const last = to ? new Date(to.getTime() - 1) : new Date()
    const out: { day: string; seconds: number }[] = []
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate())
    // The most recent 90 days of the period at most.
    const start = new Date(Math.max(d.getTime(), last.getTime() - 89 * 864e5))
    for (
      let t = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      t <= last;
      t.setDate(t.getDate() + 1)
    )
      out.push({ day: dayKey(t), seconds: per.get(dayKey(t)) ?? 0 })
    return out
  }, [playtime, player, from, to])
  const total = days.reduce((s, d) => s + d.seconds, 0)
  const played = days.filter((d) => d.seconds > 0).length
  const s = snap?.snap
  const area = s ? data.areas.find((a) => a.id === s.areaId) : undefined

  return (
    <section className="pixel-panel flex flex-col gap-3 p-3" aria-label={`${name}'s stats`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-3xl leading-none">{name}</h3>
        <span className="text-base text-muted">
          {snap
            ? `Game state as of ${new Date(snap.at).toLocaleString()}`
            : snap === null
              ? 'No game state recorded yet'
              : ''}
        </span>
      </div>

      <Block title="Daily playtime">
        <p className="text-lg">
          <b>{formatDuration(total)}</b> over {played} day{played === 1 ? '' : 's'} played
          {played > 0 && <> · {formatDuration(total / played)} per day played</>}
        </p>
        {days.length > 0 && <DailyPlaytimeChart days={days} />}
      </Block>

      {err && <p className="text-danger">Could not load this player's game state: {err}</p>}
      {snap === undefined && !err && <p className="text-lg text-muted">Loading game state…</p>}
      {snap === null && (
        <p className="text-lg text-muted">
          Nothing yet: the game sends a player's state from the version with this panel on, once they play.
        </p>
      )}
      {s && (
        <div className="grid gap-3 md:grid-cols-2">
          <Block title="Pokédex">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl leading-none">{s.dex.length}</span>
              <span className="text-lg text-muted">/ {data.speciesList.length} caught</span>
            </div>
            <div className="h-3 border-2 border-ink bg-parchment">
              <div
                className="h-full bg-hp-green"
                style={{ width: `${(s.dex.length / Math.max(1, data.speciesList.length)) * 100}%` }}
              />
            </div>
            <div className="pixel-scroll flex max-h-40 flex-wrap gap-0.5 overflow-auto">
              {s.dex.map((d) => (
                <SpriteImg key={d} dex={d} size={32} alt={data.species[d]?.name} />
              ))}
            </div>
          </Block>

          <Block title="Current area">
            {area?.bannerUrl && <AreaBanner url={area.bannerUrl} className="h-14 border-2 border-ink" />}
            <div className="text-2xl leading-none">{area?.name ?? (s.area || '?')}</div>
            <div className="text-lg text-muted">
              {s.badges} badge{s.badges === 1 ? '' : 's'} · {s.box} in the Box
              {s.dayCare.length > 0 && ` · ${s.dayCare.length} at the Day Care`}
            </div>
          </Block>

          <Block title="Team">
            <ul className="flex flex-wrap gap-2">
              {s.team.map((m, i) => (
                <li key={i} className="flex flex-col items-center border-2 border-ink bg-parchment px-2 py-1">
                  <SpriteImg dex={m.dex} size={64} shiny={m.shiny} />
                  <span className="text-lg leading-none">{data.species[m.dex]?.name ?? `#${m.dex}`}</span>
                  <span className="text-base text-muted">Lv.{m.level}</span>
                </li>
              ))}
            </ul>
            {s.dayCare.length > 0 && (
              <p className="text-base text-muted">
                Day Care:{' '}
                {s.dayCare.map((m) => `${data.species[m.dex]?.name ?? `#${m.dex}`} Lv.${m.level}`).join(', ')}
              </p>
            )}
          </Block>

          <Block title="Inventory">
            <div className="flex items-center gap-1 text-2xl">
              <PixelIcon name="coin" size={20} /> ₽{s.gold.toLocaleString()}
            </div>
            {Object.keys(s.inventory).length ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-lg">
                {Object.entries(s.inventory)
                  .sort((a, b) =>
                    (data.items[a[0]]?.name ?? a[0]).localeCompare(data.items[b[0]]?.name ?? b[0]),
                  )
                  .map(([k, n]) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {data.items[k]?.spriteUrl ? (
                        <img
                          src={data.items[k]!.spriteUrl!}
                          alt=""
                          width={24}
                          height={24}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <PixelIcon name="potion" size={18} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{data.items[k]?.name ?? k}</span>
                      <span className="font-mono">×{n}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-lg text-muted">The bag is empty.</p>
            )}
          </Block>
        </div>
      )}

      <Block title="Leaderboard">
        <LeaderboardBan player={player} name={name} />
      </Block>

      <Block title="Cheats">
        <PlayerCheats player={player} name={name} />
      </Block>
    </section>
  )
}
