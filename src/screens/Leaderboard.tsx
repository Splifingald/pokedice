// The leaderboard (the cup in the top bar): four boards for the region being played — Max level, Progression,
// Pokédex, Shiny — your place on top, and the Hall of Fame for whoever has maxed a board out.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRegion, leaderboardUnlocked, regionOf } from '@/engine'
import { BoardRow, Crown } from '@/components/BoardRow'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon, type IconName } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { Sheet } from '@/components/Sheet'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import {
  fetchLeaderboard,
  leaderboardError,
  splitLeaderboard,
  type LeaderboardRow,
  type LeaderboardTab,
} from '@/lib/leaderboard'
import { useSnapToMe } from '@/lib/useSnapToMe'
import { visitLeaderboard } from '@/store/actions'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'

/** Each tab is its icon; only the open one spells out its name (four names don't fit a phone in every language). */
const TABS: { id: LeaderboardTab; label: string; icon: IconName }[] = [
  { id: 'level', label: 'ui.board.tabLevel', icon: 'up' },
  { id: 'progress', label: 'ui.board.tabProgress', icon: 'map' },
  { id: 'dex', label: 'ui.board.tabDex', icon: 'dex' },
  { id: 'shiny', label: 'ui.board.tabShiny', icon: 'star' },
]

type Load =
  | { state: 'loading' }
  | { state: 'ready'; rows: LeaderboardRow[] }
  | { state: 'offline' }
  | { state: 'error'; why: string }

/** The board opens with the first badge; until then the screen only says so (a typed-in /leaderboard included). */
export function LeaderboardScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const open = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  if (open) return <Board />
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead icon="navRanks" title={t('ui.board.title')} onBack={() => navigate('/home')} />
      <p className="m-0 grid justify-items-center gap-2 bg-paper px-3.5 py-4 text-center text-[21px] leading-[1.1] shadow-card">
        <PixelIcon name="lock" size={36} />
        {t('ui.nav.boardLocked')}
      </p>
    </div>
  )
}

function Board() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<LeaderboardTab>('level')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [hallOpen, setHallOpen] = useState(false)
  // "Show my row" bumps this: the row blinks again.
  const [found, setFound] = useState(0)

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

  // The board on screen is always the region the player is in: switching region switches the board.
  const region = regionOf(save)
  const regionName = getRegion(data, region)?.name ?? region
  // Whoever has maxed this tab out leaves the ranking for the Hall of Fame behind the button below.
  const { board, hall } = useMemo(
    () => (load.state === 'ready' ? splitLeaderboard(load.rows, tab, data, region) : { board: [], hall: [] }),
    [load, tab, data, region],
  )
  const signedIn = auth.status === 'signed_in'
  const meRef = useSnapToMe(`${tab}:${board.findIndex((r) => r.isMe)}:${found}`)
  const mine = board.find((r) => r.isMe)
  const mineHall = hall.find((r) => r.isMe)
  const me = mine ?? mineHall
  const tabLabel = t(TABS.find((entry) => entry.id === tab)!.label)
  // The area a player is on can be a long name: it goes under the team rather than at the end of the row.
  const scoreAside = tab !== 'progress'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead
        icon="navRanks"
        title={t('ui.board.title')}
        count={regionName}
        onBack={() => navigate('/home')}
      />

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-pale p-3 shadow-card-gold">
          <p className="m-0 text-[19px] leading-tight">{t('ui.board.connect')}</p>
          <GoogleAccountButton />
        </div>
      )}

      <div role="tablist" aria-label={t('ui.board.sortBy')} className="flex shadow-ring">
        {TABS.map((entry) => {
          const open = tab === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`lb-${entry.id}`}
              aria-selected={open}
              aria-label={open ? undefined : t(entry.label)}
              title={open ? undefined : t(entry.label)}
              onClick={() => setTab(entry.id)}
              className={cx(
                'flex min-h-[44px] items-center justify-center gap-2 text-[19px] leading-none',
                open ? 'min-w-0 flex-1 bg-ink px-3 text-panel' : 'w-14 shrink-0 px-1 text-ink',
              )}
            >
              <PixelIcon name={entry.icon} size={20} />
              {open && <span className="truncate">{t(entry.label)}</span>}
            </button>
          )
        })}
      </div>

      {me && (
        <button
          type="button"
          onClick={() => (mine ? setFound((n) => n + 1) : setHallOpen(true))}
          aria-label={t('ui.board.findMe', {
            text: mine
              ? t('ui.board.mine', { rank: mine.rank, total: board.length })
              : t('ui.board.mineHall'),
          })}
          className="flex w-full items-center gap-2.5 bg-gold-pale pb-2 pl-2 pr-3 pt-1.5 text-left shadow-card-gold-lip"
        >
          <TrainerLook src={avatarOf(me.avatar).src} w={44} h={48} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <small className="font-pixel-sm text-[14px] leading-[1.1] text-muted">
              {t(`ui.board.note.${tab}`, { region: regionName })}
            </small>
            <b className="text-[21px] font-normal leading-none">
              {mine ? t('ui.board.mine', { rank: mine.rank, total: board.length }) : t('ui.board.mineHall')}
            </b>
          </span>
          <b className="shrink-0 text-right text-[20px] font-normal leading-none">{me.score}</b>
        </button>
      )}

      {hall.length > 0 && (
        <button
          type="button"
          onClick={() => setHallOpen(true)}
          className="light-scope flex w-full items-center gap-2.5 bg-night pb-2 pl-2.5 pr-3 pt-1.5 text-left text-gold-light shadow-[inset_0_-4px_0_#11182d]"
        >
          <Crown />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <b className="text-[21px] font-normal leading-none">{t('ui.board.hall')}</b>
            <small className="font-pixel-sm text-[14px] leading-[1.1] text-[#b6c3d9]">
              {tPlural('ui.board.hallSub', hall.length)}
            </small>
          </span>
          <span className="flex shrink-0 pl-1.5" aria-hidden>
            {hall.slice(0, 4).map((r, i) => (
              <TrainerLook
                key={i}
                src={avatarOf(r.avatar).src}
                w={32}
                h={32}
                className="-ml-1.5 bg-[#3a4a72] shadow-halo"
              />
            ))}
          </span>
        </button>
      )}

      <div role="tabpanel" aria-labelledby={`lb-${tab}`}>
        {load.state === 'loading' && (
          <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
        )}
        {load.state === 'error' && (
          <div className="flex flex-col items-center gap-1 p-4 text-center">
            <p className="m-0 text-[20px] text-danger">{t('ui.board.failed')}</p>
            <p className="m-0 font-pixel-sm text-[15px] text-muted">{load.why}</p>
          </div>
        )}
        {load.state === 'offline' && (
          <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.board.offline')}</p>
        )}
        {load.state === 'ready' && board.length === 0 && (
          <p className="m-0 p-4 text-center text-[20px] text-muted">
            {t(hall.length > 0 ? 'ui.board.allDone' : 'ui.board.empty')}
          </p>
        )}
        {board.length > 0 && (
          <ol className="m-0 grid list-none gap-1.5 p-0" aria-label={tabLabel}>
            {board.map((r, i) => (
              <BoardRow
                key={`${found}:${i}`}
                rowRef={r.isMe ? meRef : undefined}
                flash={r.isMe && found > 0}
                rank={r.rank}
                look={avatarOf(r.avatar).src}
                name={r.name}
                isMe={r.isMe}
                team={r.team}
                value={scoreAside ? r.score : undefined}
                sub={
                  !scoreAside && (
                    <small className="truncate font-pixel-sm text-[14px] text-muted">{r.score}</small>
                  )
                }
              />
            ))}
          </ol>
        )}
      </div>

      <Sheet
        open={hallOpen}
        onClose={() => setHallOpen(false)}
        title={t('ui.board.hall')}
        sub={`${tabLabel} · ${tPlural('ui.board.hallCount', hall.length)}`}
      >
        {tab !== 'shiny' && (
          <p className="m-0 mb-2 font-pixel-sm text-[15px] leading-[1.15] text-muted">
            {t(`ui.board.hallBody.${tab}`)}
          </p>
        )}
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {hall.map((r, i) => (
            <BoardRow
              key={i}
              lead={<Crown />}
              look={avatarOf(r.avatar).src}
              name={r.name}
              isMe={r.isMe}
              team={r.team}
              value={scoreAside ? r.score : undefined}
              sub={
                !scoreAside && (
                  <small className="truncate font-pixel-sm text-[14px] text-muted">{r.score}</small>
                )
              }
            />
          ))}
        </ul>
      </Sheet>
    </div>
  )
}
