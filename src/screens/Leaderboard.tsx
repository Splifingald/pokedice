import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n/react'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { fetchLeaderboard, leaderboardError, rankLeaderboard, type LeaderboardRow, type LeaderboardTab } from '@/lib/leaderboard'
import { visitLeaderboard } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

const TABS: { id: LeaderboardTab; label: string }[] = [
  { id: 'level', label: 'ui.board.tabLevel' },
  { id: 'progress', label: 'ui.board.tabProgress' },
  { id: 'dex', label: 'ui.board.tabDex' },
]

/** Gold, silver and bronze for the podium. */
const PODIUM = ['bg-gold', 'bg-[#c9c6d4]', 'bg-[#d9a066]']

type Load = { state: 'loading' } | { state: 'ready'; rows: LeaderboardRow[] } | { state: 'offline' } | { state: 'error'; why: string }

export function LeaderboardScreen() {
  const { t } = useT()
  const data = useGame((s) => s.data)
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

  const ranked = useMemo(() => (load.state === 'ready' ? rankLeaderboard(load.rows, tab, data) : []), [load, tab, data])
  const signedIn = auth.status === 'signed_in'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <h1 className="flex items-center gap-3 text-5xl leading-none">
        <PixelIcon name="trophy" size={36} />
        {t('ui.board.title')}
      </h1>

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-[3px] border-ink bg-parchment p-3">
          <p className="text-2xl leading-tight">{t('ui.board.connect')}</p>
          <GoogleAccountButton />
        </div>
      )}

      <div role="tablist" aria-label={t('ui.board.sortBy')} className="grid grid-cols-3 gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cx('pixel-btn min-h-[44px] px-1 text-lg leading-none sm:text-xl', tab === entry.id ? 'bg-gold' : 'bg-panel')}
          >
            {t(entry.label)}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={t(TABS.find((entry) => entry.id === tab)!.label)}>
        {load.state === 'loading' && <p className="p-4 text-center text-2xl text-muted">{t('ui.common.loading')}</p>}
        {load.state === 'error' && (
          <div className="flex flex-col items-center gap-1 p-4 text-center">
            <p className="text-2xl text-danger">{t('ui.board.failed')}</p>
            <p className="font-pixel-sm text-base text-muted">{load.why}</p>
          </div>
        )}
        {load.state === 'offline' && (
          <p className="p-4 text-center text-2xl text-muted">{t('ui.board.offline')}</p>
        )}
        {load.state === 'ready' && ranked.length === 0 && (
          <p className="p-4 text-center text-2xl text-muted">{t('ui.board.empty')}</p>
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
                  aria-label={t('ui.board.rank', { rank: r.rank })}
                >
                  {r.rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:gap-3">
                  <div className="flex min-w-0 flex-col items-center sm:w-40 sm:shrink-0 sm:items-start">
                    <span className="max-w-full truncate text-2xl leading-none">
                      {r.name}
                      {r.isMe && <span className="font-pixel-sm text-base">{t('ui.board.you')}</span>}
                    </span>
                    <span className={cx('font-pixel-sm max-w-full truncate text-base leading-tight', r.isMe ? 'text-ink' : 'text-muted')}>{r.score}</span>
                  </div>
                  <ul className="flex flex-1 flex-wrap items-center justify-center gap-0.5" aria-label={t('ui.board.theirTeam', { name: r.name })}>
                    {r.team.map((m, j) => {
                      const label = t('ui.board.monTitle', { name: data.species[m.dex]?.name ?? t('ui.common.pokemon'), level: m.level })
                      return (
                        <li key={j} title={label}>
                          <MiniSprite dex={m.dex} size={40} alt={label} />
                        </li>
                      )
                    })}
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
