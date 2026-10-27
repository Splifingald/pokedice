// The weekly Versus league (docs/44): trophies won in matches the player fights, a group of 20 ranked from Monday to
// Sunday (UTC), its rewards at the end of the week. Three opponents near your trophies, their teams and trophies shown,
// kept until one is fought; a match counts as a leave from its start until its result is in. The server keeps the
// standings and checks each result (migration 0082); the fight is the engine's (startVersus, versusStep).
// Layout as Versus's own (docs/15 §16): phones keep three tabs (Opponents, My team, the board); PC puts the opponents
// (or the team being picked) on the left, your team and the board beside them.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  leagueConfig,
  leagueReward,
  startVersus,
  versusAutoMove,
  versusEdge,
  versusNextRound,
  versusPowersOf,
  versusRulesDue,
  versusStanding,
  versusStep,
  versusUnlocked,
  winTrophies,
  type BattleEvent,
  type LeagueOutcome,
  type VersusMatch,
} from '@/engine'
import { BoardRow } from '@/components/BoardRow'
import { Chip } from '@/components/Chip'
import { AccountButton } from '@/components/AccountButton'
import { useVersusRules, VersusRulesModal } from '@/components/FeatureRules'
import { ItemSprite } from '@/components/ItemSprite'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { RulesCard } from '@/components/RulesCard'
import { InfoButton } from '@/components/RulesModal'
import { Seg } from '@/components/Segmented'
import { SocialColumns, SocialDock } from '@/components/SocialTabs'
import { TrainerSprite } from '@/components/TrainerArt'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { timeLeft } from '@/lib/format'
import { useFriends } from '@/lib/friends'
import { offlineOr } from '@/lib/online'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { fetchVersusBoard, type VersusEntry } from '@/lib/versus'
import {
  fetchLeagueChoices,
  fetchLeagueHome,
  finishLeagueMatch,
  leagueErrorCode,
  startLeagueMatch,
  type LeagueChoice,
  type LeagueHome,
  type LeagueMatchStart,
  type LeagueRow,
} from '@/lib/versusLeague'
import { markVersusRulesSeen } from '@/store/actions'
import { pushToast, useGame, type BattleSlice } from '@/store/game'
import { holdReload } from '@/store/sync'
import { useServerNow } from '@/store/serverTime'
import { cx } from '@/theme/util'
import { BattleView, type VersusReplay } from '../battle/BattleView'
import { Locked, MyTeamCard, TeamEditor } from '../Versus'

type Tab = 'fight' | 'team' | 'board'

/** A refusal of the database, said in the player's language; "You're offline" when there's no connection. */
const errorText = (t: (k: string) => string, err: unknown) =>
  offlineOr(t(`ui.league.err.${leagueErrorCode(err)}`))

type Load<T> =
  { state: 'loading' } | { state: 'ready'; value: T } | { state: 'offline' } | { state: 'error'; why: string }

export function LeagueScreen() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const signedIn = auth.status === 'signed_in'
  const wide = useMediaQuery('(min-width: 1024px)')
  const [tab, setTab] = useState<Tab>('fight')
  const [home, setHome] = useState<Load<LeagueHome>>({ state: 'loading' })
  const [choices, setChoices] = useState<Load<LeagueChoice[]>>({ state: 'loading' })
  // Your own Versus team, from Versus's board (the team is Versus's, the league only fights with it).
  const [board, setBoard] = useState<VersusEntry[] | null>(null)
  const [fight, setFight] = useState<{ start: LeagueMatchStart; n: number } | null>(null)
  const fights = useRef(0)
  const [busy, setBusy] = useState(false)
  const [rules, setRules] = useState(false)
  const rulesDue = versusRulesDue(save, data)
  const leagueRules = useVersusRules()

  const refresh = useCallback(() => {
    let live = true
    const fail = (set: (l: Load<never>) => void) => (err: unknown) => {
      console.warn('[league] fetch failed', err)
      if (live) set({ state: 'error', why: errorText(t, err) })
    }
    fetchLeagueHome()
      .then((h) => live && setHome(h ? { state: 'ready', value: h } : { state: 'offline' }))
      .catch(fail(setHome))
    fetchVersusBoard()
      .then((rows) => live && setBoard(rows))
      .catch(() => live && setBoard(null))
    if (signedIn)
      fetchLeagueChoices()
        .then((c) => live && setChoices(c ? { state: 'ready', value: c } : { state: 'offline' }))
        .catch(fail(setChoices))
    else setChoices({ state: 'ready', value: [] })
    return () => {
      live = false
    }
  }, [t, signedIn])
  useEffect(() => refresh(), [refresh, auth.userId])
  const reload = useCallback(async () => {
    const fresh = await fetchVersusBoard()
    setBoard(fresh)
    return fresh
  }, [])

  const me = board?.find((r) => r.isMe) ?? null

  const start = async (c: LeagueChoice) => {
    if (!me || busy) return
    setBusy(true)
    try {
      const s = await startLeagueMatch(c.slot)
      setFight({ start: s, n: ++fights.current })
    } catch (err) {
      console.warn('[league] start failed', err)
      pushToast(errorText(t, err), 'bad', 4500)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (fight && me)
    return (
      <LeagueFightView
        key={fight.n}
        start={fight.start}
        team={me.team}
        trophiesBefore={home.state === 'ready' ? home.value.trophies : 0}
        onExit={() => {
          setFight(null)
          refresh()
        }}
      />
    )

  if (!versusUnlocked(save, data) && !me) return <Locked />

  const view: Tab = wide && tab === 'board' ? 'fight' : tab
  const status = (l: Load<unknown>) =>
    l.state === 'loading' ? (
      <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
    ) : l.state === 'error' ? (
      <p className="m-0 p-4 text-center text-[20px] text-danger">{l.why}</p>
    ) : l.state === 'offline' ? (
      <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.versus.offline')}</p>
    ) : null
  const connect = !signedIn && (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-pale p-2.5 shadow-card-gold">
      <p className="m-0 min-w-0 flex-1 text-[19px] leading-tight">{t('ui.league.connect')}</p>
      <AccountButton size="sm" />
    </div>
  )
  const h = home.state === 'ready' ? home.value : null
  const myRank = h?.rows.find((r) => r.isMe)?.rank ?? null
  return (
    <div className="flex flex-col gap-3">
      <PageHead title={t('ui.versus.title')} social="versus" />
      {rulesDue && (
        <RulesCard
          title={t('ui.league.title')}
          icon="trophy"
          rules={leagueRules}
          onDone={markVersusRulesSeen}
        />
      )}
      {h && (
        <LeagueHeader
          trophies={h.trophies}
          rank={h.joined ? myRank : null}
          size={h.rows.length}
          endsAt={h.endsAt}
        />
      )}
      <SocialColumns
        main={
          <>
            <Seg
              tabs
              idPrefix="vl"
              label={t('ui.versus.title')}
              value={view}
              onChange={setTab}
              options={[
                { id: 'fight' as Tab, label: t('ui.versus.tabFight') },
                { id: 'team' as Tab, label: t('ui.versus.tabTeam') },
                ...(wide ? [] : [{ id: 'board' as Tab, label: t('ui.versus.tabBoard') }]),
              ]}
            />
            <div role="tabpanel" aria-labelledby={`vl-${view}`} className="flex flex-col gap-2.5">
              {view === 'fight' && (
                <>
                  {h?.pending != null && (
                    <p
                      role="note"
                      className="m-0 flex items-center gap-2 bg-well p-2.5 font-pixel-sm text-[16px] leading-tight text-muted shadow-ring-line"
                    >
                      <PixelIcon name="flag" size={16} className="shrink-0" />
                      {t('ui.league.leftNote')}
                    </p>
                  )}
                  {signedIn && !me && board != null ? (
                    <div className="grid gap-2.5 bg-gold-pale p-3.5 text-center shadow-card-gold">
                      <p className="m-0 text-[19px] leading-[1.15]">{t('ui.versus.noTeamYet')}</p>
                      <PixelButton variant="primary" onClick={() => setTab('team')}>
                        {t('ui.versus.setTeam')}
                      </PixelButton>
                    </div>
                  ) : (
                    (status(choices) ??
                    (choices.state === 'ready' && signedIn && (
                      <Choices choices={choices.value} mine={me} busy={busy} onFight={(c) => void start(c)} />
                    )))
                  )}
                </>
              )}
              {view === 'team' && <TeamEditor me={me} signedIn={signedIn} reload={reload} />}
              {view === 'board' && (status(home) ?? (h && <LeagueBoard home={h} />))}
            </div>
          </>
        }
        side={
          wide && (
            <>
              {connect}
              <MyTeamCard me={me} onChange={() => setTab('team')} editing={view === 'team'} />
              <section
                aria-labelledby="vl-board-title"
                className="flex flex-col gap-2 bg-panel p-2 shadow-card"
              >
                <h2
                  id="vl-board-title"
                  className="m-0 flex items-center gap-2 text-[24px] font-normal leading-none"
                >
                  <PixelIcon name="trophy" size={24} />
                  {t('ui.league.group')}
                </h2>
                {status(home) ?? (h && <LeagueBoard home={h} compact />)}
              </section>
            </>
          )
        }
      />
      <InfoButton name={t('ui.league.title')} onClick={() => setRules(true)} />
      {!wide && connect && view !== 'team' && <SocialDock>{connect}</SocialDock>}
      <VersusRulesModal open={rules} onClose={() => setRules(false)} />
    </div>
  )
}

/** Your trophies, your place in your group and when the week ends. */
export function LeagueHeader({
  trophies,
  rank,
  size,
  endsAt,
}: {
  trophies: number
  /** Null until the first match puts you in a group. */
  rank: number | null
  size: number
  endsAt: number
}) {
  const { t } = useT()
  const now = useServerNow(60_000) ?? Date.now()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-[linear-gradient(rgb(var(--c-sky)),rgb(var(--c-paper))_70%)] p-2.5 shadow-card">
      <span
        className="inline-flex items-center gap-1.5 font-pixel text-[28px] leading-none tabular-nums"
        aria-label={t('ui.league.trophiesLabel', { n: trophies })}
      >
        <PixelIcon name="trophy" size={28} />
        {trophies}
      </span>
      <span className="font-pixel-sm text-[16px] leading-tight text-muted">
        {rank != null ? t('ui.league.rankOf', { rank, size }) : t('ui.league.notJoined')}
      </span>
      <Chip tone="dark" className="ml-auto">
        <PixelIcon name="calendar" size={14} />{' '}
        {t('ui.league.endsIn', { time: timeLeft(Math.max(0, endsAt - now)) })}
      </Chip>
    </div>
  )
}

/** The 3 opponents offered: their look, name, trophies and team; FIGHT. One red: the one your team hits hardest. */
export function Choices({
  choices,
  mine,
  busy,
  onFight,
}: {
  choices: LeagueChoice[]
  mine: VersusEntry | null
  busy: boolean
  onFight: (c: LeagueChoice) => void
}) {
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const cfg = leagueConfig(data)
  const mineDex = mine?.team.map((m) => m.dex) ?? []
  const edgeOf = (c: LeagueChoice) =>
    versusEdge(
      mineDex,
      c.team.map((m) => m.dex),
      data,
    )
  const best = choices.reduce<LeagueChoice | null>((b, c) => (!b || edgeOf(c) > edgeOf(b) ? c : b), null)
  if (!choices.length)
    return <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.versus.noOpponents')}</p>
  return (
    <>
      <p className="m-0 font-pixel-sm text-[16px] leading-[1.15] text-muted">
        {t('ui.league.choicesHint', {
          a: winTrophies(1, cfg),
          b: winTrophies(2, cfg),
          c: winTrophies(3, cfg),
        })}
      </p>
      {busy && <p className="m-0 text-center text-[19px] text-muted">{t('ui.versus.starting')}</p>}
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {choices.map((c) => {
          const edge = edgeOf(c)
          return (
            <BoardRow
              key={c.slot}
              look={avatarOf(c.avatar).src}
              name={c.name}
              rich={c.rich}
              team={c.team}
              // Stacked (name, team, then trophies and the matchup): the line under the team needs the row's width.
              compact
              sub={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <TrophyCount n={c.trophies} />
                  {c.bot && <BotTag />}
                  {mine && (
                    <small
                      className={cx(
                        'font-pixel-sm text-[16px] leading-[1.1]',
                        edge >= 2 ? 'text-good' : edge === 0 ? 'text-danger' : 'text-muted',
                      )}
                    >
                      {edge
                        ? tPlural('ui.versus.edge', edge, { total: c.team.length })
                        : t('ui.versus.edgeNone')}
                    </small>
                  )}
                </span>
              }
            >
              <PixelButton
                variant={c === best ? 'primary' : 'dark'}
                size="sm"
                className="shrink-0 px-3"
                disabled={!mine || busy}
                aria-label={t('ui.versus.fightName', { name: c.name })}
                onClick={() => onFight(c)}
              >
                {t('ui.versus.fight')}
              </PixelButton>
            </BoardRow>
          )
        })}
      </ul>
    </>
  )
}

/** A trophy count with its icon (the words for screen readers). */
export function TrophyCount({ n, size = 16 }: { n: number; size?: number }) {
  const { t } = useT()
  return (
    <span
      className="inline-flex items-center gap-1 font-pixel-sm leading-none tabular-nums"
      style={{ fontSize: size + 4 }}
      aria-label={t('ui.league.trophiesLabel', { n })}
    >
      {n}
      <PixelIcon name="trophy" size={size} />
    </span>
  )
}

/** The admin's mark on a bot (nobody else is told). */
export function BotTag() {
  return (
    <Chip tone="plain" className="text-[14px]">
      BOT
    </Chip>
  )
}

/** What a place wins at the end of the week: the Raid Balls and Rare Candies of its band, as their pictures. */
export function RewardMark({ rank }: { rank: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const r = leagueReward(rank, leagueConfig(data))
  if (!r.raidBalls && !r.rareCandies) return null
  const ball = data.items['raid-ball']
  const candy = data.items['rare-candy']
  return (
    <span
      className="inline-flex items-center gap-1 font-pixel-sm text-[15px] leading-none text-muted"
      aria-label={t('ui.league.rewardLabel', { balls: r.raidBalls, candies: r.rareCandies })}
    >
      {r.raidBalls > 0 && ball && (
        <>
          <ItemSprite item={ball} size={18} />×{r.raidBalls}
        </>
      )}
      {r.rareCandies > 0 && candy && (
        <>
          <ItemSprite item={candy} size={18} />×{r.rareCandies}
        </>
      )}
    </span>
  )
}

/** Your group of 20, this week or last: rank, trainer, team, trophies, and what each place wins. */
export function LeagueBoard({ home, compact }: { home: LeagueHome; compact?: boolean }) {
  const { t } = useT()
  const [week, setWeek] = useState<'this' | 'last'>('this')
  const [last, setLast] = useState<Load<LeagueHome>>({ state: 'loading' })
  useEffect(() => {
    if (week !== 'last' || last.state === 'ready') return
    let live = true
    fetchLeagueHome(true)
      .then((h) => live && setLast(h ? { state: 'ready', value: h } : { state: 'offline' }))
      .catch((err) => live && setLast({ state: 'error', why: errorText(t, err) }))
    return () => {
      live = false
    }
  }, [week, last.state, t])
  const shown = week === 'this' ? home : last.state === 'ready' ? last.value : null
  return (
    <>
      <Seg
        label={t('ui.league.whichWeek')}
        value={week}
        onChange={setWeek}
        options={[
          { id: 'this', label: t('ui.league.thisWeek') },
          { id: 'last', label: t('ui.league.lastWeek') },
        ]}
      />
      {week === 'last' && last.state === 'loading' && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
      )}
      {week === 'last' && last.state === 'error' && (
        <p className="m-0 p-4 text-center text-[20px] text-danger">{last.why}</p>
      )}
      {shown && (
        <LeagueRows
          rows={shown.rows}
          compact={compact}
          empty={t(week === 'this' ? 'ui.league.boardEmpty' : 'ui.league.lastEmpty')}
        />
      )}
    </>
  )
}

/** The ranked rows themselves (Home's kitchen shows them too). */
export function LeagueRows({
  rows,
  compact,
  empty,
}: {
  rows: LeagueRow[]
  compact?: boolean
  empty: string
}) {
  const { t } = useT()
  const friends = useFriends((s) => s.ids)
  if (!rows.length) return <p className="m-0 p-4 text-center text-[19px] text-muted">{empty}</p>
  return (
    <ol className="m-0 grid list-none gap-1.5 p-0" aria-label={t('ui.league.group')}>
      {rows.map((r) => (
        <BoardRow
          key={r.id}
          rank={r.rank}
          look={avatarOf(r.avatar).src}
          name={r.name}
          rich={r.rich}
          isMe={r.isMe}
          isFriend={friends.has(r.id)}
          team={r.team}
          compact={compact}
          sub={
            (r.bot || r.rank <= 10) && (
              <span className="flex items-center gap-2">
                {r.bot && <BotTag />}
                <RewardMark rank={r.rank} />
              </span>
            )
          }
          value={<TrophyCount n={r.trophies} size={20} />}
        />
      ))}
    </ol>
  )
}

/** The end of a match: won or lost, the trophies it gave or took, the new total, BACK. */
export function LeagueResultCard({
  outcome,
  name,
  avatar,
  delta,
  trophies,
  safe,
  failed,
  onExit,
}: {
  outcome: LeagueOutcome
  name: string
  avatar: string
  /** Null while the server hasn't answered. */
  delta: number | null
  trophies: number | null
  /** A loss under the safe line (this many trophies): it cost nothing. */
  safe?: number
  /** The result couldn't be recorded: the leave it started as stands. */
  failed?: boolean
  onExit: () => void
}) {
  const { t } = useT()
  const won = outcome === 'won'
  const line: ReactNode = failed
    ? t('ui.league.notRecorded')
    : delta == null
      ? t('ui.common.loading')
      : delta === 0 && safe != null
        ? t('ui.league.safe', { safe })
        : t('ui.league.total', { n: trophies ?? 0 })
  return (
    <div className="grid gap-2 bg-paper p-3 shadow-card" role="status">
      <div className="flex items-center gap-2">
        <TrainerSprite src={avatarOf(avatar).src} size={48} />
        <h2 className="m-0 text-[28px] font-normal leading-none">
          {t(won ? 'ui.versus.won.title' : 'ui.versus.lost.title')}
        </h2>
        {delta != null && !failed && (
          <span
            className={cx(
              'ml-auto inline-flex items-center gap-1 font-pixel text-[26px] leading-none tabular-nums',
              delta > 0 ? 'text-good' : delta < 0 ? 'text-danger' : 'text-muted',
            )}
          >
            {delta > 0 ? `+${delta}` : delta}
            <PixelIcon name="trophy" size={22} />
          </span>
        )}
      </div>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
        {t(won ? 'ui.league.wonBody' : 'ui.league.lostBody', { name })} {line}
      </p>
      <PixelButton variant="primary" size="lg" className="w-full whitespace-nowrap px-2" onClick={onExit}>
        {t('ui.versus.back')}
      </PixelButton>
    </div>
  )
}

/** Battle ids for the league's slices: apart from the run's and the replays', so a remount never mistakes one. */
let liveSeq = 2_000_000

/**
 * Moves sent with the result: the player's decisions only. The rolls and die picks are left out, and so are the
 * opponent's turns, which come at once with animations off: the server weighs a win's time against these
 * (versus_league_finish), and AUTO never moves sooner than LIVE_AUTO_MIN_MS.
 */
const counted = (e: BattleEvent) => e.t !== 'TOGGLE_DIE' && e.t !== 'ROLL' && e.t !== 'AI_TURN'

/**
 * A league match, fought: the player's moves (or AUTO's) step the engine's match, battle by battle, on the battle
 * screen. At the end the result goes to the server, which answers with the trophies.
 */
export function LeagueFightView({
  start,
  team,
  trophiesBefore,
  onExit,
}: {
  start: LeagueMatchStart
  team: VersusEntry['team']
  trophiesBefore: number
  onExit: () => void
}) {
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)
  const cfg = leagueConfig(data)
  const [opened] = useState(() =>
    startVersus(team, start.foe.team, data, start.seed, {
      attacker: save ? versusPowersOf(save, data) : undefined,
      defender: start.foe.powers,
    }),
  )
  const match = useRef<VersusMatch>(opened.match)
  const [slice, setSlice] = useState<BattleSlice>(() => ({
    state: opened.match.state,
    log: opened.log,
    id: ++liveSeq,
  }))
  const [round, setRound] = useState(0)
  const [auto, setAuto] = useState(false)
  const moves = useRef<BattleEvent[]>([])
  const forfeited = useRef(false)
  const [end, setEnd] = useState<{
    outcome: LeagueOutcome
    delta: number | null
    trophies: number | null
    failed?: boolean
  } | null>(null)

  // A pending reload (new build, Admin → "Reload all players") waits for the end of the fight.
  useEffect(() => holdReload(), [])

  const finish = useCallback(
    (m: VersusMatch) => {
      const outcome: LeagueOutcome = forfeited.current ? 'left' : m.winner === 'attacker' ? 'won' : 'lost'
      const standing = versusStanding(m)
      setEnd({ outcome, delta: null, trophies: null })
      finishLeagueMatch(start.matchId, {
        outcome,
        left: standing.left,
        foeLeft: standing.foeLeft,
        moves: moves.current,
      })
        .then((r) => setEnd({ outcome, delta: r.delta, trophies: r.trophies }))
        .catch((err) => {
          console.warn('[league] finish failed', err)
          setEnd({ outcome, delta: null, trophies: null, failed: true })
        })
    },
    [start.matchId],
  )

  // The next battle, once this one has played out and the moment has sunk in; or the result.
  const onPlayed = useCallback(() => {
    const next = versusNextRound(match.current, data)
    match.current = next.match
    if (next.match.winner) {
      finish(next.match)
      return
    }
    const timer = setTimeout(() => {
      setRound(next.match.round)
      setSlice({ state: next.match.state, log: next.log, id: ++liveSeq })
    }, 700)
    return () => clearTimeout(timer)
  }, [data, finish])

  const replay: VersusReplay = {
    dispatch: (e: BattleEvent) => {
      const r = versusStep(match.current, e, data)
      if (r.match === match.current) return
      match.current = r.match
      if (e.t === 'FORFEIT') forfeited.current = true
      if (counted(e)) moves.current.push(e)
      setSlice((s) => ({ ...s, state: r.match.state, log: [...s.log, ...r.log] }))
    },
    nextMove: () => {
      const m = versusAutoMove(match.current, data)
      match.current = m.match
      return m.events
    },
    trainerName: start.foe.name,
    trainerSprite: avatarOf(start.foe.avatar).src,
    foeCount: start.foe.team.length,
    foeIndex: round,
    onPlayed,
    live: { auto, onAuto: setAuto },
    end: end ? (
      <LeagueResultCard
        outcome={end.outcome}
        name={start.foe.name}
        avatar={start.foe.avatar}
        delta={end.delta}
        trophies={end.trophies}
        safe={trophiesBefore < cfg.safeBelow && end.outcome !== 'won' ? cfg.safeBelow : undefined}
        failed={end.failed}
        onExit={onExit}
      />
    ) : undefined,
  }

  return <BattleView key={slice.id} battle={slice} versus={replay} />
}
