// Admin → Analytics: what players do, read from analytics_events (admin-only via RLS).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ANALYTICS_KINDS, type AnalyticsKind } from '@/analytics/events'
import {
  dayOneRetention,
  RETENTION_MIN_FIRST_DAY_EVENTS,
  type Retention,
  type RetentionEvent,
} from '@/analytics/retention'
import { AreaBanner } from '@/components/AreaBanner'
import { BadgeIcon } from '@/components/BadgeIcon'
import { PixelIcon, type IconName } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { COMBO_NAMES, type ComboKey, type GameData } from '@/engine'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { cx, typeColor } from '@/theme/util'
import { inputCls } from '../widgets'

interface EventRow {
  id: number
  created_at: string
  user_id: string | null
  device_id: string
  player_name: string | null
  email: string | null
  kind: AnalyticsKind
  params: Record<string, unknown>
}

const KIND: Record<AnalyticsKind, { label: string; icon: IconName; color: string }> = {
  login: { label: 'Logged in', icon: 'run', color: '#547acc' },
  game_started: { label: 'New game', icon: 'ball', color: '#6b6480' },
  level_up: { label: 'Level up', icon: 'up', color: '#2f6b36' },
  evolved: { label: 'Evolved', icon: 'star', color: '#8a4fb0' },
  area_unlocked: { label: 'Area found', icon: 'map', color: '#2a8a8a' },
  badge: { label: 'Badge', icon: 'crown', color: '#b8860b' },
  item_bought: { label: 'Bought', icon: 'coin', color: '#c26a1a' },
  item_used: { label: 'Item used', icon: 'potion', color: '#c2457a' },
  upgrade: { label: 'Upgrade', icon: 'dice', color: '#a8341f' },
}

const FRAMES = [
  { id: '24h', label: '24 h', ms: 864e5 },
  { id: '7d', label: '7 days', ms: 7 * 864e5 },
  { id: '30d', label: '30 days', ms: 30 * 864e5 },
  { id: '90d', label: '90 days', ms: 90 * 864e5 },
  { id: 'all', label: 'All time', ms: null },
  { id: 'custom', label: 'Custom', ms: null },
] as const
type FrameId = (typeof FRAMES)[number]['id']

const playerKey = (r: EventRow) => r.user_id ?? `device:${r.device_id}`
const num = (v: unknown) => Number(v) || 0
const str = (v: unknown) => (v == null ? '' : String(v))
const dayInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** A date input's value as local midnight (not UTC), so days match the viewer's calendar. */
const localDay = (v: string, plusDays = 0) => {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y!, m! - 1, d! + plusDays)
}

async function fetchEvents(
  from: Date | null,
  to: Date | null,
  columns = '*',
  max = 20_000,
): Promise<EventRow[]> {
  const client = await getSupabase()
  if (!client) throw new Error('Supabase client unavailable')
  const out: EventRow[] = []
  const page = 1000
  for (let offset = 0; offset < max; offset += page) {
    let q = client.from('analytics_events').select(columns).order('created_at', { ascending: false })
    if (from) q = q.gte('created_at', from.toISOString())
    if (to) q = q.lt('created_at', to.toISOString())
    const { data, error } = await q.range(offset, offset + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as unknown as EventRow[]))
    if (!data || data.length < page) break
  }
  return out
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

function KindChip({ kind }: { kind: AnalyticsKind }) {
  const k = KIND[kind]
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap border-2 border-ink px-1.5 py-0.5 text-base leading-none text-panel"
      style={{ background: k.color, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
    >
      <span className="flex h-4 w-4 items-center justify-center bg-panel">
        <PixelIcon name={k.icon} size={12} />
      </span>
      {k.label}
    </span>
  )
}

const Mon = ({ dex, data }: { dex: number; data: GameData }) => (
  <span className="inline-flex items-center gap-1">
    <SpriteImg dex={dex} size={32} />
    <b>{data.species[dex]?.name ?? `#${dex}`}</b>
  </span>
)

const Lv = ({ children }: { children: ReactNode }) => (
  <span className="border-2 border-ink bg-gold px-1 leading-none">{children}</span>
)

const Cost = ({ gold }: { gold: number }) =>
  gold > 0 ? (
    <span className="inline-flex items-center gap-1 text-muted">
      <PixelIcon name="coin" size={14} />
      {gold.toLocaleString()}
    </span>
  ) : null

function itemIcon(key: string, data: GameData): IconName {
  if (key.includes('master')) return 'masterball'
  const kind = data.items[key]?.effect.kind
  return kind === 'ball' ? 'ball' : kind === 'level' ? 'up' : 'potion'
}

function Details({ row, data }: { row: EventRow; data: GameData }) {
  const p = row.params
  switch (row.kind) {
    case 'login':
      return <span className="text-muted">Session started{row.email ? '' : ' (guest)'}</span>
    case 'game_started':
      return p.starterDex ? (
        <span className="inline-flex items-center gap-2">
          Chose <Mon dex={num(p.starterDex)} data={data} />
          {p.character ? (
            <span className="text-muted">as {str(p.character) === 'green' ? 'Green' : 'Red'}</span>
          ) : null}
        </span>
      ) : (
        <span>Started a game</span>
      )
    case 'level_up':
      return (
        <span className="inline-flex items-center gap-2">
          <Mon dex={num(p.dex)} data={data} />
          <Lv>Lv {num(p.from)}</Lv>→<Lv>Lv {num(p.to)}</Lv>
          {num(p.to) - num(p.from) > 1 && <span className="text-good">+{num(p.to) - num(p.from)}</span>}
        </span>
      )
    case 'evolved':
      return (
        <span className="inline-flex items-center gap-2">
          <Mon dex={num(p.fromDex)} data={data} />
          <PixelIcon name="star" size={14} />
          <Mon dex={num(p.toDex)} data={data} />
          <span className="text-muted">at Lv {num(p.level)}</span>
        </span>
      )
    case 'area_unlocked': {
      const area = data.areas.find((a) => a.id === p.areaId)
      return (
        <span className="inline-flex items-center gap-2">
          {area?.bannerUrl && <AreaBanner url={area.bannerUrl} className="h-6 !w-16 border border-ink" />}
          <b>{area?.name ?? str(p.area)}</b>
          {p.hidden ? (
            <span className="border-2 border-ink bg-ink px-1 leading-none text-gold">SECRET</span>
          ) : null}
        </span>
      )
    }
    case 'badge':
      return (
        <span className="inline-flex items-center gap-2">
          <BadgeIcon badge={str(p.badge)} earned size={24} />
          <b>{str(p.badge)}</b>
          <span className="text-muted">from {str(p.leader)}</span>
        </span>
      )
    case 'item_bought':
    case 'item_used': {
      const key = str(p.key)
      return (
        <span className="inline-flex items-center gap-2">
          <PixelIcon name={itemIcon(key, data)} size={20} />
          <b>{data.items[key]?.name ?? key}</b>
          <span>×{num(p.qty)}</span>
          {row.kind === 'item_bought' ? (
            <Cost gold={num(p.cost)} />
          ) : (
            <span className="border-2 border-shadow px-1 text-sm uppercase leading-none text-muted">
              {str(p.where)}
            </span>
          )}
        </span>
      )
    }
    case 'upgrade': {
      const isDie = p.track === 'die'
      const key = str(p.key)
      return (
        <span className="inline-flex items-center gap-2">
          {isDie ? (
            <span
              className="border-2 border-ink px-1 uppercase leading-none text-panel"
              style={{ background: typeColor(key), textShadow: '1px 1px 0 #2a2438' }}
            >
              {key} die
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <PixelIcon name="dice" size={16} />
              <b>{COMBO_NAMES[key as ComboKey] ?? key}</b>
            </span>
          )}
          <Lv>Lv {num(p.from)}</Lv>→<Lv>Lv {num(p.to)}</Lv>
          <Cost gold={num(p.cost)} />
        </span>
      )
    }
  }
}

function RetentionHero({ retention: r }: { retention: Retention | null }) {
  const pct = r?.rate == null ? null : Math.round(r.rate * 100)
  const color = pct == null ? '#6b6480' : pct >= 40 ? '#4aa84a' : pct >= 20 ? '#e8b44a' : '#c2452d'
  const left = r
    ? [
        r.pending > 0 && `${r.pending} whose next day isn't over yet`,
        r.tooFewEvents > 0 &&
          `${r.tooFewEvents} with fewer than ${RETENTION_MIN_FIRST_DAY_EVENTS} events on day one`,
      ].filter(Boolean)
    : []
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
          New players whose first day falls in this time frame, with at least {RETENTION_MIN_FIRST_DAY_EVENTS}{' '}
          events that day, who had at least 1 event the next calendar day.
          {left.length > 0 && ` Not counted: ${left.join(', ')}.`}
        </p>
      </div>
    </section>
  )
}

type PlayerSort = 'name' | 'events' | 'last' | 'levels' | 'badges' | 'spent'
type EventSort = 'time' | 'player' | 'kind'

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

function useSort<K extends string>(initial: K, initialDir: 1 | -1 = -1) {
  const [key, setKey] = useState<K>(initial)
  const [dir, setDir] = useState<1 | -1>(initialDir)
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 1 ? -1 : 1))
    else {
      setKey(k)
      setDir(-1)
    }
  }
  return { key, dir, toggle }
}

export function AnalyticsSection() {
  const data = useGame((s) => s.data)
  const [frame, setFrame] = useState<FrameId>('7d')
  const [customFrom, setCustomFrom] = useState(() => dayInput(new Date(Date.now() - 30 * 864e5)))
  const [customTo, setCustomTo] = useState(() => dayInput(new Date()))
  const [rows, setRows] = useState<EventRow[]>([])
  const [retention, setRetention] = useState<Retention | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState<string>('all')
  const [kinds, setKinds] = useState<Set<AnalyticsKind>>(() => new Set(ANALYTICS_KINDS))
  const [shown, setShown] = useState(200)
  const pSort = useSort<PlayerSort>('last')
  const eSort = useSort<EventSort>('time')

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const f = FRAMES.find((x) => x.id === frame)!
      const from = frame === 'custom' ? localDay(customFrom) : f.ms ? new Date(Date.now() - f.ms) : null
      const to = frame === 'custom' ? localDay(customTo, 1) : null
      // Retention needs every player's whole history (their first day may predate the frame): who and when only.
      const [events, history] = await Promise.all([
        fetchEvents(from, to),
        fetchEvents(null, null, 'user_id,device_id,created_at', 200_000),
      ])
      setRows(events)
      const light: RetentionEvent[] = history.map((r) => ({
        player: playerKey(r),
        at: new Date(r.created_at),
      }))
      setRetention(dayOneRetention(light, from, to))
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [frame, customFrom, customTo])

  useEffect(() => {
    if (isSupabaseConfigured) void load()
  }, [load])
  useEffect(() => setShown(200), [player, kinds, frame])

  const players = useMemo(() => {
    const by = new Map<
      string,
      {
        key: string
        name: string
        email: string | null
        guest: boolean
        events: number
        last: string
        levels: number
        badges: number
        spent: number
        logins: number
      }
    >()
    for (const r of rows) {
      const key = playerKey(r)
      const p = by.get(key) ?? {
        key,
        name: '',
        email: null,
        guest: !r.user_id,
        events: 0,
        last: r.created_at,
        levels: 0,
        badges: 0,
        spent: 0,
        logins: 0,
      }
      p.events++
      if (r.created_at > p.last) p.last = r.created_at
      if (!p.name && r.player_name) p.name = r.player_name
      if (!p.email && r.email) p.email = r.email
      if (r.kind === 'level_up') p.levels += num(r.params.to) - num(r.params.from)
      if (r.kind === 'badge') p.badges++
      if (r.kind === 'login') p.logins++
      if (r.kind === 'item_bought' || r.kind === 'upgrade') p.spent += num(r.params.cost)
      by.set(key, p)
    }
    const list = [...by.values()].map((p) => ({
      ...p,
      name: p.name || p.email?.split('@')[0] || `Guest ${p.key.slice(-4)}`,
    }))
    const val = (p: (typeof list)[number]) =>
      pSort.key === 'name' ? p.name.toLowerCase() : pSort.key === 'last' ? p.last : p[pSort.key]
    return list.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * pSort.dir)
  }, [rows, pSort.key, pSort.dir])
  const nameOf = useMemo(() => new Map(players.map((p) => [p.key, p])), [players])

  const inPlayer = useMemo(
    () => (player === 'all' ? rows : rows.filter((r) => playerKey(r) === player)),
    [rows, player],
  )
  const counts = useMemo(() => {
    const c = Object.fromEntries(ANALYTICS_KINDS.map((k) => [k, 0])) as Record<AnalyticsKind, number>
    for (const r of inPlayer) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [inPlayer])
  const events = useMemo(() => {
    const list = inPlayer.filter((r) => kinds.has(r.kind))
    const val = (r: EventRow) =>
      eSort.key === 'time'
        ? r.created_at
        : eSort.key === 'kind'
          ? KIND[r.kind].label
          : (nameOf.get(playerKey(r))?.name.toLowerCase() ?? '')
    return [...list].sort((a, b) => {
      const d = val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0
      return (d || (a.created_at < b.created_at ? -1 : 1)) * eSort.dir
    })
  }, [inPlayer, kinds, eSort.key, eSort.dir, nameOf])

  if (!isSupabaseConfigured)
    return <p className="text-xl">Analytics needs Supabase — this admin is running offline.</p>

  const toggleKind = (k: AnalyticsKind) =>
    setKinds((cur) => {
      const next = new Set(cur)
      if (cur.size === ANALYTICS_KINDS.length) return new Set([k])
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next.size ? next : new Set(ANALYTICS_KINDS)
    })
  const selected = player === 'all' ? null : nameOf.get(player)

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
        {frame === 'custom' && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              aria-label="From"
              className={cx(inputCls, 'w-auto')}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span>→</span>
            <input
              type="date"
              aria-label="To"
              className={cx(inputCls, 'w-auto')}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}
        <select
          aria-label="Player"
          className={cx(inputCls, 'w-auto max-w-[220px]')}
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="all">All players ({players.length})</option>
          {[...players]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} ({p.events})
              </option>
            ))}
        </select>
        <PixelButton size="sm" onClick={() => void load()} disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading…' : 'Refresh'}
        </PixelButton>
      </div>

      <RetentionHero retention={status === 'loading' ? null : retention} />

      {status === 'error' && (
        <div className="pixel-panel p-3 text-lg">
          <p className="text-danger">Could not load analytics: {error}</p>
          <p>Has supabase/migrations/0006_analytics.sql been run?</p>
        </div>
      )}

      {/* One tile per event kind; clicking filters the feed. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <div className="pixel-panel-dark flex flex-col justify-between p-2">
          <span className="text-lg uppercase text-gold">{selected ? selected.name : 'Players'}</span>
          <span className="text-4xl leading-none">{selected ? inPlayer.length : players.length}</span>
          <span className="text-sm opacity-80">
            {selected ? 'events' : `${rows.length.toLocaleString()} events`}
          </span>
        </div>
        {ANALYTICS_KINDS.map((k) => {
          const on = kinds.has(k) && kinds.size < ANALYTICS_KINDS.length
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => toggleKind(k)}
              className={cx(
                'pixel-panel flex items-center gap-2 p-2 text-left transition-transform hover:-translate-y-0.5',
                !kinds.has(k) && 'opacity-40',
              )}
              style={on ? { outline: `3px solid ${KIND[k].color}`, outlineOffset: 2 } : undefined}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink"
                style={{ background: KIND[k].color }}
              >
                <span className="flex h-7 w-7 items-center justify-center bg-panel">
                  <PixelIcon name={KIND[k].icon} size={20} />
                </span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-3xl leading-none">{counts[k].toLocaleString()}</span>
                <span className="truncate text-base text-muted">{KIND[k].label}</span>
              </span>
            </button>
          )
        })}
      </div>

      <section className="pixel-panel overflow-hidden p-0" aria-label="Players">
        <h3 className="border-b-[3px] border-ink px-3 py-1 text-2xl">Players</h3>
        <div className="pixel-scroll max-h-[320px] overflow-auto">
          <table className="w-full text-lg">
            <thead className="sticky top-0 bg-ink text-left">
              <tr>
                <SortTh
                  label="Player"
                  active={pSort.key === 'name'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('name')}
                />
                <SortTh
                  label="Events"
                  right
                  active={pSort.key === 'events'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('events')}
                />
                <SortTh
                  label="Levels"
                  right
                  active={pSort.key === 'levels'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('levels')}
                />
                <SortTh
                  label="Badges"
                  right
                  active={pSort.key === 'badges'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('badges')}
                />
                <SortTh
                  label="Spent"
                  right
                  active={pSort.key === 'spent'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('spent')}
                />
                <SortTh
                  label="Last seen"
                  right
                  active={pSort.key === 'last'}
                  dir={pSort.dir}
                  onClick={() => pSort.toggle('last')}
                />
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr
                  key={p.key}
                  onClick={() => setPlayer(player === p.key ? 'all' : p.key)}
                  className={cx(
                    'cursor-pointer border-t border-shadow/40 hover:bg-gold/30',
                    player === p.key ? 'bg-gold/60' : i % 2 ? 'bg-parchment/50' : '',
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
                      <b className="truncate">{p.name}</b>
                      {p.email && <span className="truncate text-base text-muted">{p.email}</span>}
                    </span>
                  </td>
                  <td className="px-2 text-right">{p.events}</td>
                  <td className="px-2 text-right text-good">{p.levels ? `+${p.levels}` : '–'}</td>
                  <td className="px-2 text-right">{p.badges || '–'}</td>
                  <td className="px-2 text-right">{p.spent ? p.spent.toLocaleString() : '–'}</td>
                  <td className="px-2 text-right text-muted" title={new Date(p.last).toLocaleString()}>
                    {ago(p.last)}
                  </td>
                </tr>
              ))}
              {status === 'ready' && !players.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-muted">
                    No player activity in this time frame.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pixel-panel overflow-hidden p-0" aria-label="Events">
        <h3 className="flex items-center gap-2 border-b-[3px] border-ink px-3 py-1 text-2xl">
          Events <span className="text-lg text-muted">{events.length.toLocaleString()}</span>
          {selected && (
            <button
              type="button"
              className="ml-auto border-2 border-ink bg-gold px-2 text-base"
              onClick={() => setPlayer('all')}
            >
              {selected.name} ✕
            </button>
          )}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-lg">
            <thead className="bg-ink text-left">
              <tr>
                <SortTh
                  label="When"
                  active={eSort.key === 'time'}
                  dir={eSort.dir}
                  onClick={() => eSort.toggle('time')}
                />
                <SortTh
                  label="Player"
                  active={eSort.key === 'player'}
                  dir={eSort.dir}
                  onClick={() => eSort.toggle('player')}
                />
                <SortTh
                  label="Event"
                  active={eSort.key === 'kind'}
                  dir={eSort.dir}
                  onClick={() => eSort.toggle('kind')}
                />
                <th className="px-2 py-1 uppercase text-panel">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, shown).map((r, i) => (
                <tr
                  key={r.id}
                  className={cx('border-t border-shadow/40', i % 2 === 1 && 'bg-parchment/50')}
                  style={{ boxShadow: `inset 4px 0 0 ${KIND[r.kind].color}` }}
                >
                  <td
                    className="whitespace-nowrap px-2 py-1 pl-3"
                    title={new Date(r.created_at).toLocaleString()}
                  >
                    <span className="block leading-none">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-base leading-none text-muted">
                      {new Date(r.created_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="px-2">
                    <button
                      type="button"
                      className="truncate text-left underline decoration-dotted"
                      onClick={() => setPlayer(playerKey(r))}
                    >
                      {nameOf.get(playerKey(r))?.name ?? '?'}
                    </button>
                  </td>
                  <td className="px-2">
                    <KindChip kind={r.kind} />
                  </td>
                  <td className="px-2 py-1">
                    <Details row={r} data={data} />
                  </td>
                </tr>
              ))}
              {status === 'ready' && !events.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted">
                    No events match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {events.length > shown && (
          <div className="border-t-[3px] border-ink p-2 text-center">
            <PixelButton size="sm" onClick={() => setShown((n) => n + 300)}>
              Show more ({(events.length - shown).toLocaleString()} left)
            </PixelButton>
          </div>
        )}
      </section>
    </div>
  )
}
