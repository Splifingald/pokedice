// The leaderboard (Social's first view, docs/43 §5.8): Max level, Progression and Pokédex for the region being played,
// Shiny and Raids over every region. Phones: the boards, the ranking, your place pinned at the foot (a tap finds your
// row). PC: the ranking on the left; your place and the Hall of Fame beside it, always in view.
import { useEffect, useMemo, useState } from 'react'
import {
  extremeRegionList,
  extremeRegions,
  getRegion,
  isExtreme,
  leaderboardUnlocked,
  linearAreas,
  regionOf,
  regionSpecies,
  type GameData,
} from '@/engine'
import { ExtremeBoard } from '@/components/ExtremeBoard'
import { otherSave } from '@/store/extreme'
import { BoardGap, BoardRow, Crown, ScoreMeter } from '@/components/BoardRow'
import { FriendProfileSheet } from '@/components/friends/FriendProfileSheet'
import { Seg } from '@/components/Segmented'
import { AccountButton } from '@/components/AccountButton'
import { PixelIcon, type IconName } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { Sheet } from '@/components/Sheet'
import { SocialColumns, SocialDock } from '@/components/SocialTabs'
import { TrainerLook } from '@/components/TrainerLook'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { useOnline } from '@/lib/online'
import { useFriends } from '@/lib/friends'
import { useFriendsFilter } from '@/lib/useFriendsFilter'
import { useMediaQuery } from '@/lib/useMediaQuery'
import {
  boardWindow,
  crossRegion,
  fetchLeaderboard,
  friendsOnly,
  leaderboardError,
  rebattleOnBoard,
  splitLeaderboard,
  type LeaderboardTab,
  type RankedRow,
  type LeaderboardRow,
} from '@/lib/leaderboard'
import { useSnapToMe } from '@/lib/useSnapToMe'
import { visitLeaderboard } from '@/store/actions'
import { useGame } from '@/store/game'

/**
 * The five boards, each its icon over a short name (docs/43 §5.8): every name shows, at 16 px, on a 360 px phone in
 * every language (the old icons-only tabs, the open one alone named, made four of five a guess).
 */
const TABS: { id: LeaderboardTab; label: string; icon: IconName }[] = [
  { id: 'level', label: 'ui.board.tabLevel', icon: 'up' },
  { id: 'progress', label: 'ui.board.tabProgress', icon: 'map' },
  { id: 'dex', label: 'ui.board.tabDex', icon: 'dex' },
  { id: 'shiny', label: 'ui.board.tabShiny', icon: 'star' },
  { id: 'raids', label: 'ui.board.tabRaids', icon: 'ball' },
]

type Load =
  | { state: 'loading' }
  | { state: 'ready'; rows: LeaderboardRow[] }
  | { state: 'offline' }
  | { state: 'error'; why: string }

/** The board opens with the first badge; until then the screen only says so (a typed-in /leaderboard included). */
export function LeaderboardScreen() {
  const { t } = useT()
  const open = useGame((s) => !!s.save && leaderboardUnlocked(s.save, s.data))
  const extreme = useGame((s) => isExtreme(s.save))
  const data = useGame((s) => s.data)
  // Extreme mode is a race (docs/48): its one board is the best times, region by region (the regions the main save
  // opened, the one being played first).
  if (extreme) {
    const live = regionOf(useGame.getState().save!)
    const opened = new Set(extremeRegions(otherSave(), data).map((r) => r.id))
    const regions = extremeRegionList(data).filter((r) => opened.has(r.id) || r.id === live)
    regions.sort((a, b) => (a.id === live ? -1 : b.id === live ? 1 : 0))
    return (
      <div className="flex flex-col gap-3">
        <PageHead icon="navRanks" title={t('ui.board.title')} social="board" />
        <ExtremeBoard regions={regions} />
      </div>
    )
  }
  if (open) return <Board />
  return (
    <div className="flex flex-col gap-3">
      <PageHead icon="navRanks" title={t('ui.board.title')} social="board" />
      <p className="m-0 mx-auto grid w-full max-w-xl justify-items-center gap-2 bg-paper px-3.5 py-4 text-center text-[21px] leading-[1.1] shadow-card">
        <PixelIcon name="lock" size={36} />
        {t('ui.nav.boardLocked')}
      </p>
    </div>
  )
}

/** A row's place on its board, as a bar where the board has a ceiling (the level cap, the region's areas or Pokédex). */
function rowMeter(row: RankedRow, tab: LeaderboardTab, data: GameData, dexSize: number): number | undefined {
  if (tab === 'level') return row.maxLevel / Math.max(1, data.config.maxLevel)
  if (tab === 'dex') return row.pokedex / Math.max(1, dexSize)
  if (tab === 'progress') {
    const chain = linearAreas(data, row.region)
    return chain.filter((a) => row.progress[a.id]?.cleared).length / Math.max(1, chain.length)
  }
  return undefined
}

function Board() {
  const { t, tPlural } = useT()
  const online = useOnline()
  const wide = useMediaQuery('(min-width: 1024px)')
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<LeaderboardTab>('level')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [hallOpen, setHallOpen] = useState(false)
  // "Show my row" bumps this: the row blinks again.
  const [found, setFound] = useState(0)
  const [onlyFriends, setOnlyFriends] = useFriendsFilter()
  const [card, setCard] = useState<{ id: string; name: string } | null>(null)
  const hasFriends = useFriends((s) => s.ids.size > 0)

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

  // The board on screen is the region the player is in (switching region switches the board), but for Shiny and
  // Raids, which rank every region together.
  const region = regionOf(save)
  const regionName = getRegion(data, region)?.name ?? region
  const dexSize = regionSpecies(data, region).size || data.speciesList.length
  // Progression's texts name the Elite Rebattle where the board counts its tiers.
  const textKey = tab === 'progress' && rebattleOnBoard(data, region) ? 'progressRebattle' : tab
  const scope = crossRegion(tab) ? t('ui.board.allRegions') : regionName
  // Whoever has maxed this tab out leaves the ranking for the Hall of Fame.
  const { board, hall } = useMemo(
    () => (load.state === 'ready' ? splitLeaderboard(load.rows, tab, data, region) : { board: [], hall: [] }),
    [load, tab, data, region],
  )
  const signedIn = auth.status === 'signed_in'
  // FRIENDS keeps the whole board's ranks: the filter only hides rows. ALL shows the top, you and your friends.
  const filtering = signedIn && hasFriends && onlyFriends
  const shown = filtering ? friendsOnly(board).map((row) => ({ row })) : boardWindow(board)
  const friendRows = board.filter((r) => r.friendId).length
  const open = (r: LeaderboardRow) =>
    r.friendId ? () => setCard({ id: r.friendId!, name: r.name }) : undefined
  const meRef = useSnapToMe(`${tab}:${board.findIndex((r) => r.isMe)}:${found}:${filtering}`)
  const mine = board.find((r) => r.isMe)
  const mineHall = hall.find((r) => r.isMe)
  const me = mine ?? mineHall
  const tabLabel = t(TABS.find((entry) => entry.id === tab)!.label)
  const note = t(`ui.board.note.${textKey}`, { region: regionName })
  const placeText = mine
    ? t('ui.board.mine', { rank: mine.rank, total: board.length })
    : t('ui.board.mineHall')
  // In the Hall of Fame: on a phone its sheet opens; on PC it is beside the board already.
  const findMe = () => (mine ? setFound((n) => n + 1) : !wide && setHallOpen(true))

  /** What a row shows for this board: the area being worked on (under the team), else the measure at its end. */
  const scoreOf = (row: RankedRow) => {
    const meter = rowMeter(row, tab, data, dexSize)
    if (tab === 'progress')
      return {
        sub: (
          <span className="flex min-w-0 items-center gap-2">
            <small className="min-w-0 truncate font-pixel-sm text-[16px] text-muted">{row.score}</small>
            {meter != null && <ScoreMeter value={meter} className="w-16 shrink-0" />}
          </span>
        ),
      }
    // Shinies and raids: the count and the board's icon, the words for screen readers ("3 shinies").
    if (tab === 'shiny' || tab === 'raids')
      return {
        value: (
          <span
            role="img"
            aria-label={tPlural(
              tab === 'shiny' ? 'ui.board.shinies' : 'ui.board.raids',
              tab === 'shiny' ? row.shinies : row.raidsWon,
            )}
            className="inline-flex items-center gap-1.5"
          >
            {tab === 'shiny' ? row.shinies : row.raidsWon}
            <PixelIcon name={tab === 'shiny' ? 'star' : 'ball'} size={18} />
          </span>
        ),
      }
    // The Pokédex: the count and its bar (the region's size is said once, in the note); the level: Lv.N and its bar.
    return {
      value: (
        <span className="grid justify-items-end gap-1">
          <span aria-hidden>{tab === 'dex' ? row.pokedex : row.score}</span>
          <span className="sr-only">{row.score}</span>
          {meter != null && <ScoreMeter value={meter} className="w-14" />}
        </span>
      ),
    }
  }

  // Phones: a row of five, each its icon over its name. PC: the side column's list of boards, each with what it counts.
  const noteOf = (id: LeaderboardTab) =>
    t(`ui.board.note.${id === 'progress' && rebattleOnBoard(data, region) ? 'progressRebattle' : id}`, {
      region: regionName,
    })
  const boardTabs = (
    <Seg
      tabs
      idPrefix="lb"
      label={t('ui.board.sortBy')}
      value={tab}
      onChange={setTab}
      className={
        wide
          ? 'flex-col [&>button]:min-h-[56px] [&>button]:justify-start [&>button]:whitespace-normal [&>button]:px-3 [&>button]:py-2 [&>button]:text-left'
          : '[&>button]:px-1 [&>button]:pb-1.5 [&>button]:pt-2'
      }
      options={TABS.map((entry) => ({
        id: entry.id,
        label: wide ? (
          <span className="flex min-w-0 items-center gap-3">
            <PixelIcon name={entry.icon} size={24} className="shrink-0" />
            <span className="grid min-w-0 gap-1">
              <span className="text-[20px] leading-none">{t(entry.label)}</span>
              <small className="font-pixel-sm text-[16px] leading-[1.1] opacity-80">{noteOf(entry.id)}</small>
            </span>
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-[16px] leading-none">
            <PixelIcon name={entry.icon} size={20} />
            {t(entry.label)}
          </span>
        ),
      }))}
    />
  )

  /** Your place: the gold card. On a phone it is the bar pinned at the foot; on PC the side column's head. */
  const place = me && (
    <button
      type="button"
      onClick={findMe}
      aria-label={t('ui.board.findMe', { text: placeText })}
      className="flex w-full items-center gap-2.5 bg-gold-pale pb-2 pl-2 pr-3 pt-1.5 text-left shadow-card-gold-lip"
    >
      <TrainerLook src={avatarOf(me.avatar).src} w={wide ? 64 : 40} h={wide ? 72 : 44} />
      <span className="grid min-w-0 flex-1 gap-1">
        <b className="text-[22px] font-normal leading-none lg:text-[26px]">{placeText}</b>
        {/* Phones: what this board counts (PC lists it with each board). Your score is your row's. */}
        {!wide && <small className="font-pixel-sm text-[16px] leading-[1.1] text-muted">{note}</small>}
      </span>
    </button>
  )

  const connect = !signedIn && (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-pale p-2.5 shadow-card-gold">
      <p className="m-0 min-w-0 flex-1 text-[19px] leading-tight">{t('ui.board.connect')}</p>
      <AccountButton size="sm" />
    </div>
  )

  const hallRows = (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {/* A long Hall of Fame is cut as the boards are: its first 100, you and those near you, your friends. */}
      {boardWindow(hall).map((item, i) =>
        'gap' in item ? (
          <BoardGap key={i} count={item.gap} />
        ) : (
          <BoardRow
            key={i}
            lead={<Crown />}
            look={avatarOf(item.row.avatar).src}
            name={item.row.name}
            rich={item.row.rich}
            isMe={item.row.isMe}
            isFriend={!!item.row.friendId}
            onOpen={open(item.row)}
            team={item.row.team}
            compact={wide}
          />
        ),
      )}
    </ul>
  )
  const hallBody = tab !== 'shiny' && tab !== 'raids' && (
    <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">
      {t(`ui.board.hallBody.${textKey}`)}
    </p>
  )

  /** The Hall of Fame's head: the crown, its name, how many and their faces. A button on a phone (its sheet). */
  const hallHead = (button: boolean) => {
    const inner = (
      <>
        <Crown />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <b className="text-[21px] font-normal leading-none">{t('ui.board.hall')}</b>
          <small className="font-pixel-sm text-[16px] leading-[1.1] text-[#b6c3d9]">
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
      </>
    )
    const cls =
      'light-scope flex w-full items-center gap-2.5 bg-night pb-2 pl-2.5 pr-3 pt-1.5 text-left text-gold-light shadow-[inset_0_-4px_0_#11182d]'
    return button ? (
      <button type="button" onClick={() => setHallOpen(true)} className={cls}>
        {inner}
      </button>
    ) : (
      <h2 className={`m-0 font-normal ${cls}`}>{inner}</h2>
    )
  }

  const list = (
    <div role="tabpanel" aria-labelledby={`lb-${tab}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Where you are: the board and its region (or every region). */}
        <h2 className="m-0 text-[22px] font-normal leading-none">
          {tabLabel} · <span className="text-muted">{scope}</span>
        </h2>
        {signedIn && hasFriends && (
          <Seg
            label={t('ui.friends.filterLabel')}
            value={onlyFriends ? 'friends' : 'all'}
            onChange={(v) => setOnlyFriends(v === 'friends')}
            options={[
              { id: 'all', label: t('ui.friends.filterAll'), count: board.length },
              { id: 'friends', label: t('ui.friends.title'), count: friendRows },
            ]}
          />
        )}
      </div>
      {!wide && hall.length > 0 && hallHead(true)}
      {load.state === 'loading' && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      )}
      {load.state === 'error' &&
        (online ? (
          <div className="flex flex-col items-center gap-1 p-4 text-center">
            <p className="m-0 text-[20px] text-danger">{t('ui.board.failed')}</p>
            <p className="m-0 font-pixel-sm text-[16px] text-muted">{load.why}</p>
          </div>
        ) : (
          <p className="m-0 p-4 text-center text-[20px] text-danger">{t('ui.common.offline')}</p>
        ))}
      {load.state === 'offline' && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.board.offline')}</p>
      )}
      {load.state === 'ready' && board.length === 0 && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">
          {t(hall.length > 0 ? 'ui.board.allDone' : 'ui.board.empty')}
        </p>
      )}
      {filtering && board.length > 0 && friendRows === 0 && (
        <p className="m-0 p-2 text-center text-[19px] text-muted">{t('ui.friends.noneOnBoard')}</p>
      )}
      {shown.length > 0 && (
        <ol className="m-0 grid list-none gap-1.5 p-0" aria-label={tabLabel}>
          {shown.map((item, i) =>
            'gap' in item ? (
              <BoardGap key={`${found}:${i}`} count={item.gap} />
            ) : (
              <BoardRow
                key={`${found}:${i}`}
                rowRef={item.row.isMe ? meRef : undefined}
                flash={item.row.isMe && found > 0}
                rank={item.row.rank}
                look={avatarOf(item.row.avatar).src}
                name={item.row.name}
                rich={item.row.rich}
                isMe={item.row.isMe}
                isFriend={!!item.row.friendId}
                onOpen={open(item.row)}
                team={item.row.team}
                {...scoreOf(item.row)}
              />
            ),
          )}
        </ol>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <PageHead icon="navRanks" title={t('ui.board.title')} social="board" />
      <SocialColumns
        main={
          <>
            {!wide && boardTabs}
            {list}
          </>
        }
        side={
          wide && (
            <>
              {connect}
              {place}
              {boardTabs}
              {hall.length > 0 && (
                <section className="flex flex-col gap-2 bg-panel p-2 shadow-card">
                  {hallHead(false)}
                  {hallBody}
                  {hallRows}
                </section>
              )}
            </>
          )
        }
      />

      {/* Phones: your place (or the way to take part) pinned at the foot, a tap away from your row. */}
      {!wide && (connect || place) && <SocialDock>{connect || place}</SocialDock>}

      {!wide && (
        <Sheet
          open={hallOpen}
          onClose={() => setHallOpen(false)}
          title={t('ui.board.hall')}
          sub={`${tabLabel} · ${tPlural('ui.board.hallCount', hall.length)}`}
        >
          <div className="flex flex-col gap-2">
            {hallBody}
            {hallRows}
          </div>
        </Sheet>
      )}

      <FriendProfileSheet userId={card?.id ?? null} name={card?.name} onClose={() => setCard(null)} />
    </div>
  )
}
