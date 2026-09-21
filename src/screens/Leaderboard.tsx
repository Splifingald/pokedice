import { useEffect, useMemo, useState } from 'react'
import { useT } from '@/i18n/react'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { Modal } from '@/components/Modal'
import { TrainerSprite } from '@/components/TrainerArt'
import { fetchLeaderboard, leaderboardError, splitLeaderboard, type LeaderboardRow, type LeaderboardTab, type RankedRow } from '@/lib/leaderboard'
import { regionOf } from '@/engine'
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
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<LeaderboardTab>('level')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [hallOpen, setHallOpen] = useState(false)

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
  // Whoever has maxed this tab out leaves the ranking for the Hall of Fame behind the button below.
  const { board, hall } = useMemo(
    () => (load.state === 'ready' ? splitLeaderboard(load.rows, tab, data, region) : { board: [], hall: [] }),
    [load, tab, data, region],
  )
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

      {hall.length > 0 && (
        <button
          type="button"
          onClick={() => setHallOpen(true)}
          className="pixel-btn flex min-h-[44px] items-center justify-center gap-2 bg-gold px-3 text-2xl leading-none"
        >
          <PixelIcon name="crown" size={20} />
          {t('ui.board.hall')}
          <span className="font-pixel-sm text-base">{tPlural('ui.board.hallCount', hall.length)}</span>
        </button>
      )}

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
        {load.state === 'ready' && board.length === 0 && (
          <p className="p-4 text-center text-2xl text-muted">{t(hall.length > 0 ? 'ui.board.allDone' : 'ui.board.empty')}</p>
        )}
        {board.length > 0 && (
          <ol className="flex flex-col gap-2">
            {board.map((r, i) => (
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

      <Modal open={hallOpen} onClose={() => setHallOpen(false)} title={t('ui.board.hall')} className="max-w-3xl">
        <p className="copy mb-3 text-lg text-muted">{t(`ui.board.hallBody.${tab}`)}</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {hall.map((r, i) => (
            <HallCell key={i} r={r} />
          ))}
        </ul>
      </Modal>
    </div>
  )
}

/** One trainer in the Hall of Fame grid: who they are, what they finished, and the team they did it with. */
function HallCell({ r }: { r: RankedRow }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <li
      aria-current={r.isMe || undefined}
      className={cx('flex flex-col items-center gap-1 border-[3px] border-ink p-2 text-center', r.isMe ? 'bg-[#fbeeb0]' : 'bg-panel')}
    >
      <TrainerSprite src={`/characters/${r.character}.png`} size={56} />
      <span className="max-w-full truncate text-xl leading-none">
        {r.name}
        {r.isMe && <span className="font-pixel-sm text-base">{t('ui.board.you')}</span>}
      </span>
      <span className="font-pixel-sm flex items-center gap-1 text-base leading-none text-muted">
        <PixelIcon name="crown" size={12} />
        {r.score}
      </span>
      <ul className="flex flex-wrap justify-center gap-0.5" aria-label={t('ui.board.theirTeam', { name: r.name })}>
        {r.team.map((m, j) => {
          const label = t('ui.board.monTitle', { name: data.species[m.dex]?.name ?? t('ui.common.pokemon'), level: m.level })
          return (
            <li key={j} title={label}>
              <MiniSprite dex={m.dex} size={28} alt={label} />
            </li>
          )
        })}
      </ul>
    </li>
  )
}
