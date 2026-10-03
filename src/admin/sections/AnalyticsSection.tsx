// Admin → Analytics: day-1 retention and the players, from the daily ping (migration 0028). Admin-only via RLS.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dayKey, dayOneRetention, type D1Cohorts, type Retention } from '@/analytics/retention'
import { PixelButton } from '@/components/PixelButton'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { cx } from '@/theme/util'
import { inputCls } from '../widgets'
import { errorText, PlayerPanel } from './AnalyticsPlayer'

interface PlayerRow {
  player: string
  user_id: string | null
  name: string | null
  email: string | null
  first_day: string
  last_day: string
  days: number
  /** From the latest daily snapshot. */
  area: string | null
  badges: number | null
  team: { dex: number; level: number }[] | null
}

const FRAMES = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
] as const
type FrameId = (typeof FRAMES)[number]['id']

const startOfDay = (daysAgo: number) => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo)
}

async function client() {
  const c = await getSupabase()
  if (!c) throw new Error('Supabase client unavailable')
  return c
}

async function fetchCohorts(): Promise<D1Cohorts> {
  const { data, error } = await (await client()).rpc('analytics_d1')
  if (error) throw error
  return (data ?? {}) as D1Cohorts
}

/** Players seen on or after `since` (null = all), most recent first, a page of 1000 at a time. */
async function fetchPlayers(since: Date | null, max = 10_000): Promise<PlayerRow[]> {
  const c = await client()
  const out: PlayerRow[] = []
  const page = 1000
  while (out.length < max) {
    let q = c
      .from('players')
      .select(
        'player,user_id,name,email,first_day,last_day,days,area:snapshot->>area,badges:snapshot->badges,team:snapshot->team',
      )
      .order('last_day', { ascending: false })
      .order('player')
    if (since) q = q.gte('last_day', dayKey(since))
    const { data, error } = await q.range(out.length, out.length + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as unknown as PlayerRow[]))
    if (!data || data.length < page) break
  }
  return out
}

const rateColor = (pct: number | null) =>
  pct == null ? '#6b6480' : pct >= 40 ? '#4aa84a' : pct >= 20 ? '#e8b44a' : '#c2452d'

function RetentionHero({ r }: { r: Retention | null }) {
  const pct = r?.rate == null ? null : Math.round(r.rate * 100)
  const color = rateColor(pct)
  return (
    <section
      className="pixel-panel-dark flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6"
      aria-label="Retention"
    >
      <div className="flex shrink-0 flex-col">
        <span className="text-xl uppercase tracking-wider text-gold">Day-1 retention</span>
        <span className="text-7xl leading-none sm:text-8xl" style={{ color }}>
          {r == null ? '…' : pct == null ? '–' : `${pct}%`}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {r && (
          <>
            <div
              className="h-6 w-full border-2 border-panel bg-ink"
              role="img"
              aria-label={`${r.returned} of ${r.cohort} players came back`}
            >
              <div className="h-full" style={{ width: `${pct ?? 0}%`, background: color }} />
            </div>
            <p className="text-2xl leading-tight">
              {r.cohort ? (
                <>
                  <b className="text-gold">{r.returned}</b> of <b className="text-gold">{r.cohort}</b> new
                  players came back the next day
                </>
              ) : (
                'No new players to measure yet in this time frame'
              )}
            </p>
          </>
        )}
        <p className="text-base leading-snug opacity-80">
          New players whose first day falls in this time frame who played again the next calendar day
          (theirs). A player counts on each day they open the game with a save.
          {r && r.pending > 0 && ` Not counted yet: ${r.pending} whose next day isn't over.`}
        </p>
      </div>
    </section>
  )
}

type PlayerSort = 'name' | 'first' | 'last' | 'days' | 'topLevel' | 'badges'

function SortTh({
  label,
  active,
  dir,
  onClick,
  right,
}: {
  label: string
  active: boolean
  dir: 1 | -1
  onClick: () => void
  right?: boolean
}) {
  return (
    <th
      className={cx('px-2 py-1', right && 'text-right')}
      aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={cx('inline-flex items-center gap-1 uppercase', active ? 'text-gold' : 'text-panel')}
        onClick={onClick}
      >
        {label}
        <span aria-hidden>{active ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

/** A new column sorts highest first, except the `ascFirst` ones (names: A → Z). */
function useSort<K extends string>(initial: K, initialDir: 1 | -1 = -1, ascFirst: readonly K[] = []) {
  const [key, setKey] = useState<K>(initial)
  const [dir, setDir] = useState<1 | -1>(initialDir)
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setKey(k)
      setDir(ascFirst.includes(k) ? 1 : -1)
    }
  }
  return { key, dir, toggle }
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })

export function AnalyticsSection() {
  const [frame, setFrame] = useState<FrameId>('30d')
  const [cohorts, setCohorts] = useState<D1Cohorts | null>(null)
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(200)
  const sort = useSort<PlayerSort>('last', -1, ['name'])

  const from = useMemo(() => {
    const days = FRAMES.find((f) => f.id === frame)!.days
    return days == null ? null : startOfDay(days - 1)
  }, [frame])

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const [c, p] = await Promise.all([fetchCohorts(), fetchPlayers(from)])
      setCohorts(c)
      setRows(p)
      setStatus('ready')
    } catch (err) {
      setError(errorText(err))
      setStatus('error')
    }
  }, [from])

  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])
  useEffect(() => setShown(200), [frame, search])

  const retention = useMemo(() => (cohorts ? dayOneRetention(cohorts, from, null) : null), [cohorts, from])

  const players = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = rows
      .map((r) => ({
        ...r,
        guest: !r.user_id,
        label: r.name || r.email?.split('@')[0] || `Guest ${r.player.slice(-4)}`,
        topLevel: Math.max(0, ...(r.team ?? []).map((m) => Number(m.level) || 0)),
        badgeCount: Number(r.badges) || 0,
      }))
      .filter((r) => !q || r.label.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q))
    const val = (p: (typeof list)[number]): string | number =>
      sort.key === 'name'
        ? p.label.toLowerCase()
        : sort.key === 'first'
          ? p.first_day
          : sort.key === 'last'
            ? p.last_day
            : sort.key === 'badges'
              ? p.badgeCount
              : p[sort.key]
    return list.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [rows, search, sort.key, sort.dir])

  if (!isSupabaseConfigured)
    return <p className="text-xl">Analytics needs Supabase — this admin is running offline.</p>

  const selected = player ? players.find((p) => p.player === player) : null
  const newInFrame = from ? rows.filter((r) => r.first_day >= dayKey(from)).length : rows.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="text-4xl leading-none">Analytics</h2>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time frame">
          {FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={frame === f.id}
              onClick={() => setFrame(f.id)}
              className={cx('pixel-btn px-2 py-0.5 text-lg', frame === f.id ? 'bg-gold' : 'bg-panel')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <PixelButton size="sm" onClick={() => void load()} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading…' : 'Refresh'}
        </PixelButton>
      </div>

      <RetentionHero r={status === 'loading' ? null : retention} />

      {status === 'error' && (
        <div className="pixel-panel p-3 text-lg">
          <p className="text-danger">Could not load analytics: {error}</p>
          <p>Has supabase/migrations/0028_analytics_minimal.sql been run?</p>
        </div>
      )}

      {selected && <PlayerPanel key={selected.player} player={selected.player} name={selected.label} />}

      <section className="pixel-panel overflow-hidden p-0" aria-label="Players">
        <h3 className="flex flex-wrap items-center gap-3 border-b-[3px] border-ink px-3 py-1 text-2xl">
          Players
          <span className="text-lg text-muted">
            {rows.length.toLocaleString()} seen · {newInFrame.toLocaleString()} new
          </span>
          <input
            type="search"
            aria-label="Search players"
            placeholder="Name or email"
            className={cx(inputCls, 'ml-auto w-auto max-w-[220px] text-lg')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </h3>
        <div className="pixel-scroll max-h-[520px] overflow-auto">
          <table className="w-full text-lg">
            <thead className="sticky top-0 bg-ink text-left">
              <tr>
                <SortTh
                  label="Player"
                  active={sort.key === 'name'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('name')}
                />
                <th className="px-2 py-1 uppercase text-panel">Area</th>
                <SortTh
                  label="Top Lv."
                  right
                  active={sort.key === 'topLevel'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('topLevel')}
                />
                <SortTh
                  label="Badges"
                  right
                  active={sort.key === 'badges'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('badges')}
                />
                <SortTh
                  label="Days"
                  right
                  active={sort.key === 'days'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('days')}
                />
                <SortTh
                  label="First day"
                  right
                  active={sort.key === 'first'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('first')}
                />
                <SortTh
                  label="Last day"
                  right
                  active={sort.key === 'last'}
                  dir={sort.dir}
                  onClick={() => sort.toggle('last')}
                />
              </tr>
            </thead>
            <tbody>
              {players.slice(0, shown).map((p, i) => (
                <tr
                  key={p.player}
                  onClick={() => setPlayer(player === p.player ? null : p.player)}
                  className={cx(
                    'cursor-pointer border-t border-shadow/40 hover:bg-gold/30',
                    player === p.player ? 'bg-gold/60' : i % 2 ? 'bg-parchment/50' : '',
                  )}
                >
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cx(
                          'border-2 border-ink px-1 text-sm leading-none',
                          p.guest ? 'bg-parchment text-muted' : 'bg-hp-green text-ink',
                        )}
                        title={p.guest ? 'Playing without an account' : 'Signed in with Google'}
                      >
                        {p.guest ? 'GUEST' : 'GOOGLE'}
                      </span>
                      <b className="truncate">{p.label}</b>
                      {p.email && <span className="truncate text-base text-muted">{p.email}</span>}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-2" title={p.area ?? ''}>
                    {p.area || '–'}
                  </td>
                  <td className="px-2 text-right">{p.topLevel || '–'}</td>
                  <td className="px-2 text-right">{p.badgeCount || '–'}</td>
                  <td className="px-2 text-right">{p.days}</td>
                  <td className="whitespace-nowrap px-2 text-right text-muted">{dayLabel(p.first_day)}</td>
                  <td className="whitespace-nowrap px-2 text-right text-muted">{dayLabel(p.last_day)}</td>
                </tr>
              ))}
              {status === 'ready' && !players.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted">
                    {search ? 'No player matches.' : 'No players in this time frame.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {players.length > shown && (
          <div className="border-t-[3px] border-ink p-2 text-center">
            <PixelButton size="sm" onClick={() => setShown((n) => n + 300)}>
              Show more ({(players.length - shown).toLocaleString()} left)
            </PixelButton>
          </div>
        )}
      </section>
    </div>
  )
}
