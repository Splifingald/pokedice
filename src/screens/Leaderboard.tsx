import { useEffect, useMemo, useState } from 'react'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { fetchLeaderboard, leaderboardError, rankLeaderboard, type LeaderboardRow, type LeaderboardTab } from '@/lib/leaderboard'
import { regionOf } from '@/engine'
import { visitLeaderboard } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: 'level', label: 'Max level' },
  { id: 'progress', label: 'Progression' },
  { id: 'dex', label: 'Pokédex' },
]

/** Gold, silver and bronze for the podium. */
const PODIUM = ['bg-gold', 'bg-[#c9c6d4]', 'bg-[#d9a066]']

type Load = { state: 'loading' } | { state: 'ready'; rows: LeaderboardRow[] } | { state: 'offline' } | { state: 'error'; why: string }

export function LeaderboardScreen() {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<LeaderboardTab>('level')
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => visitLeaderboard(), [])

  // Refetched when the player signs in or out, so their own row shows up (or stops being marked "you").
  useEffect(() => {
    let live = true
    fetchLeaderboard()
      .then((rows) => live && setLoad(rows ? { state: 'ready', rows } : { state: 'offline' }))
      .catch((err) => {
        console.warn('[leaderboard] fetch failed', err)
        if (live) setLoad({ state: 'error', why: leaderboardError(err) })
      })
    return () => {
      live = false
    }
  }, [auth.userId])

  // The board on screen is always the region the player is in: switching region on the map switches the board.
  const region = regionOf(save)
  const ranked = useMemo(
    () => (load.state === 'ready' ? rankLeaderboard(load.rows, tab, data, region) : []),
    [load, tab, data, region],
  )
  const signedIn = auth.status === 'signed_in'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <h1 className="flex items-center gap-3 text-5xl leading-none">
        <PixelIcon name="trophy" size={36} />
        Leaderboard
      </h1>

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-[3px] border-ink bg-parchment p-3">
          <p className="text-2xl leading-tight">Connect to Google to participate</p>
          <GoogleAccountButton />
        </div>
      )}

      <div role="tablist" aria-label="Sort by" className="grid grid-cols-3 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('pixel-btn min-h-[44px] px-1 text-lg leading-none sm:text-xl', tab === t.id ? 'bg-gold' : 'bg-panel')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {load.state === 'loading' && <p className="p-4 text-center text-2xl text-muted">Loading…</p>}
        {load.state === 'error' && (
          <div className="flex flex-col items-center gap-1 p-4 text-center">
            <p className="text-2xl text-danger">Couldn't load the leaderboard. Try again later.</p>
            <p className="font-pixel-sm text-base text-muted">{load.why}</p>
          </div>
        )}
        {load.state === 'offline' && (
          <p className="p-4 text-center text-2xl text-muted">The leaderboard needs the cloud, which isn't set up on this site.</p>
        )}
        {load.state === 'ready' && ranked.length === 0 && (
          <p className="p-4 text-center text-2xl text-muted">No trainers yet — be the first!</p>
        )}
        {ranked.length > 0 && (
          <ol className="flex flex-col gap-2">
            {ranked.map((r, i) => (
              <li
                key={i}
                aria-current={r.isMe || undefined}
                className={cx(
                  'flex items-center gap-3 border-[3px] border-ink px-2 py-1.5 shadow-[3px_3px_0_#6b6480]',
                  r.isMe ? 'bg-[#fbeeb0]' : 'bg-panel',
                )}
              >
                <span
                  className={cx(
                    'flex h-11 min-w-[44px] shrink-0 items-center justify-center border-[3px] border-ink px-1 text-3xl leading-none',
                    PODIUM[r.rank - 1] ?? 'bg-parchment',
                  )}
                  aria-label={`Rank ${r.rank}`}
                >
                  {r.rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:gap-3">
                  <div className="flex min-w-0 flex-col items-center sm:w-40 sm:shrink-0 sm:items-start">
                    <span className="max-w-full truncate text-2xl leading-none">
                      {r.name}
                      {r.isMe && <span className="font-pixel-sm text-base"> (you)</span>}
                    </span>
                    <span className={cx('font-pixel-sm max-w-full truncate text-base leading-tight', r.isMe ? 'text-ink' : 'text-muted')}>{r.score}</span>
                  </div>
                  <ul className="flex flex-1 flex-wrap items-center justify-center gap-0.5" aria-label={`${r.name}'s team`}>
                    {r.team.map((m, j) => (
                      <li key={j} title={`${data.species[m.dex]?.name ?? '?'} Lv.${m.level}`}>
                        <MiniSprite dex={m.dex} size={40} alt={`${data.species[m.dex]?.name ?? 'Pokémon'} Lv.${m.level}`} />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
