// Versus: leave a team of three Lv.50 clones for other players to fight, fight theirs, and climb two boards — teams
// beaten in attack, fights won in defense. Every fight is decided and recorded before it plays (engine/versus).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cloneForVersus,
  getRegion,
  randomSeed,
  sameEvent,
  simulateVersus,
  versusCandidates,
  versusMoveAt,
  versusReadyCount,
  versusUnlocked,
  VERSUS_TEAM_SIZE,
  type BattleEvent,
  type VersusFight,
  type VersusMon,
} from '@/engine'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { avatarOf } from '@/lib/avatars'
import { useSnapToMe } from '@/lib/useSnapToMe'
import { searchFold } from '@/i18n'
import { useT } from '@/i18n/react'
import {
  fetchVersusBoard,
  opponentsOf,
  rankVersus,
  recordVersus,
  setVersusTeam,
  versusErrorCode,
  type VersusBoardTab,
  type VersusEntry,
} from '@/lib/versus'
import { pushToast, useGame, type BattleSlice } from '@/store/game'
import { pushSaveNow } from '@/store/sync'
import { cx } from '@/theme/util'
import { BattleView, type VersusReplay } from './battle/BattleView'
import { Overlay } from './battle/VictoryView'

type Tab = 'fight' | 'team' | 'board'
type Load = { state: 'loading' } | { state: 'ready'; rows: VersusEntry[] } | { state: 'offline' } | { state: 'error'; why: string }

const TABS: { id: Tab; label: string }[] = [
  { id: 'fight', label: 'ui.versus.tabFight' },
  { id: 'team', label: 'ui.versus.tabTeam' },
  { id: 'board', label: 'ui.versus.tabBoard' },
]

/** Gold, silver and bronze for the podium (as on the main leaderboard). */
const PODIUM = ['bg-gold', 'bg-[#c9c6d4]', 'bg-[#d9a066]']

/** A refusal of the database, said in the player's language. */
const errorText = (t: (k: string) => string, err: unknown) => t(`ui.versus.err.${versusErrorCode(err)}`)

export function VersusScreen() {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<Tab>('fight')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [fight, setFight] = useState<{ fight: VersusFight; foe: VersusEntry } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    let live = true
    fetchVersusBoard()
      .then((rows) => live && setLoad(rows ? { state: 'ready', rows } : { state: 'offline' }))
      .catch((err) => {
        console.warn('[versus] fetch failed', err)
        if (live) setLoad({ state: 'error', why: errorText(t, err) })
      })
    return () => {
      live = false
    }
  }, [t])
  // Refetched when the player signs in or out, so "you" and "beaten" follow.
  useEffect(() => refresh(), [refresh, auth.userId])
  /** The board, fetched again and handed back: saving a team reads it to check the team is really there. */
  const reload = useCallback(async () => {
    const fresh = await fetchVersusBoard()
    setLoad(fresh ? { state: 'ready', rows: fresh } : { state: 'offline' })
    return fresh
  }, [])

  const rows = load.state === 'ready' ? load.rows : []
  const me = rows.find((r) => r.isMe) ?? null
  const signedIn = auth.status === 'signed_in'

  // The fight is computed here, recorded, and only then played: its result is written before the first frame.
  const startFight = async (foe: VersusEntry) => {
    if (!me || busy) return
    setBusy(true)
    const seed = randomSeed()
    const result = simulateVersus(me.team, foe.team, data, seed)
    try {
      await recordVersus(foe, seed, result.winner === 'attacker')
      setFight({ fight: result, foe })
    } catch (err) {
      console.warn('[versus] record failed', err)
      pushToast(errorText(t, err), 'bad', 4500)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (fight)
    return (
      <VersusFightView
        fight={fight.fight}
        foe={fight.foe}
        onExit={() => {
          setFight(null)
          refresh()
        }}
      />
    )

  if (!versusUnlocked(save, data) && !me) return <Locked count={versusReadyCount(save, data)} />

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <h1 className="flex items-center gap-3 text-5xl leading-none">
        <PixelIcon name="sword" size={36} />
        {t('ui.versus.title')}
      </h1>
      <p className="copy text-lg leading-tight text-muted">{t('ui.versus.intro')}</p>

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-[3px] border-ink bg-parchment p-3">
          <p className="text-2xl leading-tight">{t('ui.versus.connect')}</p>
          <GoogleAccountButton />
        </div>
      )}

      <div role="tablist" aria-label={t('ui.versus.title')} className="grid grid-cols-3 gap-1.5">
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
        {load.state === 'error' && <p className="p-4 text-center text-2xl text-danger">{load.why}</p>}
        {load.state === 'offline' && <p className="p-4 text-center text-2xl text-muted">{t('ui.versus.offline')}</p>}
        {load.state === 'ready' && tab === 'fight' && (
          <Opponents rows={rows} me={me} signedIn={signedIn} busy={busy} onFight={startFight} onSetTeam={() => setTab('team')} />
        )}
        {load.state === 'ready' && tab === 'team' && <TeamEditor me={me} signedIn={signedIn} reload={reload} />}
        {load.state === 'ready' && tab === 'board' && <Board rows={rows} />}
      </div>
    </div>
  )
}

/** Versus is closed: how far the player is from opening it. */
function Locked({ count }: { count: number }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 p-4 text-center">
      <PixelIcon name="lock" size={48} />
      <h1 className="text-5xl leading-none">{t('ui.versus.title')}</h1>
      <p className="copy text-2xl leading-tight">{t('ui.versus.locked')}</p>
      <p className="font-pixel-sm text-xl">{t('ui.versus.lockedCount', { n: Math.min(count, VERSUS_TEAM_SIZE) })}</p>
    </div>
  )
}

/** A team's three clones, small, in fight order. */
function TeamStrip({ team, name, size = 40 }: { team: VersusMon[]; name: string; size?: number }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <ol className="flex flex-wrap items-center justify-center gap-0.5" aria-label={t('ui.board.theirTeam', { name })}>
      {team.map((m, i) => {
        const label = t('ui.board.monTitle', { name: data.species[m.dex]?.name ?? t('ui.common.pokemon'), level: m.level })
        return (
          <li key={i} title={label} className="relative">
            <MiniSprite dex={m.dex} size={size} alt={label} />
            {m.shiny && <PixelIcon name="star" size={10} className="absolute right-0 top-0" />}
          </li>
        )
      })}
    </ol>
  )
}

function Opponents({
  rows,
  me,
  signedIn,
  busy,
  onFight,
  onSetTeam,
}: {
  rows: VersusEntry[]
  me: VersusEntry | null
  signedIn: boolean
  busy: boolean
  onFight: (foe: VersusEntry) => void
  onSetTeam: () => void
}) {
  const { t, tPlural } = useT()
  const list = useMemo(() => opponentsOf(rows), [rows])
  return (
    <div className="flex flex-col gap-2">
      {signedIn && !me && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-[3px] border-ink bg-[#fbeeb0] p-3">
          <p className="text-xl leading-tight">{t('ui.versus.noTeamYet')}</p>
          <PixelButton variant="primary" size="sm" onClick={onSetTeam}>
            {t('ui.versus.setTeam')}
          </PixelButton>
        </div>
      )}
      {busy && <p className="text-center text-xl text-muted">{t('ui.versus.starting')}</p>}
      {list.length === 0 && <p className="p-4 text-center text-2xl text-muted">{t('ui.versus.noOpponents')}</p>}
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li
            key={r.userId}
            className={cx('flex items-center gap-2 border-[3px] border-ink px-2 py-1.5 shadow-[3px_3px_0_#6b6480]', r.beaten ? 'bg-parchment' : 'bg-panel')}
          >
            <TrainerSprite src={avatarOf(r.avatar).src} size={48} />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1 sm:flex-row sm:gap-3">
              <div className="flex min-w-0 flex-col items-center sm:w-36 sm:shrink-0 sm:items-start">
                <span className="max-w-full truncate text-2xl leading-none">{r.name}</span>
                <span className="font-pixel-sm flex items-center gap-1 text-base leading-tight text-muted">
                  <PixelIcon name="crown" size={12} />
                  {tPlural('ui.versus.defenseWins', r.defenseWins)}
                </span>
              </div>
              <TeamStrip team={r.team} name={r.name} />
            </div>
            {r.beaten ? (
              <span
                className="flex shrink-0 items-center gap-1 border-2 border-ink bg-hp-green px-2 py-1 text-lg leading-none"
                title={t('ui.versus.beatenHint', { name: r.name })}
              >
                <PixelIcon name="check" size={14} />
                {t('ui.versus.beaten')}
              </span>
            ) : (
              <PixelButton
                variant="primary"
                size="sm"
                className="shrink-0"
                disabled={!me || busy}
                aria-label={t('ui.versus.fightName', { name: r.name })}
                onClick={() => onFight(r)}
              >
                <PixelIcon name="sword" size={14} /> {t('ui.versus.fight')}
              </PixelButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Your team as it stands, and three picks from the Box to replace it. */
function TeamEditor({
  me,
  signedIn,
  reload,
}: {
  me: VersusEntry | null
  signedIn: boolean
  reload: () => Promise<VersusEntry[] | null>
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  // The saved team starts picked, so the screen shows which Pokémon are in it.
  const [picks, setPicks] = useState<string[]>(() => me?.ids ?? [])
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')
  // Every region's Box, strongest first; the region being played, then the Box order, break ties.
  const candidates = useMemo(() => [...versusCandidates(save, data)].sort((a, b) => b.inst.level - a.inst.level), [save, data])
  // Several regions played: each Pokémon says which one it comes from.
  const manyRegions = new Set(candidates.map((c) => c.region)).size > 1
  // The search narrows the list by name; picks it hides stay picked.
  const needle = searchFold(q)
  const shown = needle ? candidates.filter((c) => searchFold(data.species[c.inst.dex]?.name ?? '').includes(needle)) : candidates
  // A pick that has left the Box (released, or sent to the Day Care) is dropped.
  const valid = picks.filter((id) => candidates.some((c) => c.inst.id === id))
  // The picks are the team already saved: nothing to save.
  const isSaved = !!me?.ids && me.ids.length === valid.length && me.ids.every((id, i) => valid[i] === id)

  const toggle = (id: string) =>
    setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= VERSUS_TEAM_SIZE ? cur : [...cur, id]))

  const submit = async () => {
    if (valid.length !== VERSUS_TEAM_SIZE || saving) return
    setSaving(true)
    try {
      // The team is built from the cloud save: it has to have these three first.
      if (!(await pushSaveNow())) throw new Error('versus_no_save')
      const before = me?.version
      const version = await setVersusTeam(valid)
      // Only said to be saved once the board shows it back.
      const mine = (await reload())?.find((r) => r.isMe)
      if (!mine || mine.version !== version) throw new Error('versus_not_saved')
      pushToast(t(before === version ? 'ui.versus.unchanged' : 'ui.versus.saved'), 'good')
    } catch (err) {
      console.warn('[versus] set team failed', err)
      pushToast(errorText(t, err), 'bad', 4500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="versus-search" className="sr-only">
        {t('ui.versus.searchLabel')}
      </label>
      <input
        id="versus-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('ui.versus.search')}
        className="min-h-[44px] w-full border-[3px] border-ink bg-panel px-2 text-xl"
      />

      <section className="flex flex-col items-center gap-1 border-[3px] border-ink bg-panel p-2">
        <h2 className="text-2xl leading-none">{t('ui.versus.yourTeam')}</h2>
        {me ? <TeamStrip team={me.team} name={me.name} size={56} /> : <p className="text-xl text-muted">{t('ui.versus.noTeam')}</p>}
      </section>

      <p className="copy text-lg leading-tight">{t('ui.versus.pickHint')}</p>
      <p className="copy text-base leading-tight text-muted">{t('ui.versus.rules')}</p>

      {shown.length === 0 && <p className="copy text-center text-lg text-muted">{t('ui.search.noMatch')}</p>}
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {shown.map(({ inst: p, region }) => {
          const order = valid.indexOf(p.id)
          const clone = cloneForVersus(p)
          const name = data.species[p.dex]?.name ?? t('ui.common.pokemon')
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={order >= 0}
                onClick={() => toggle(p.id)}
                className={cx(
                  'pixel-btn relative flex min-h-[56px] w-full items-center gap-1 px-1.5 py-1 text-left',
                  order >= 0 ? 'bg-gold' : 'bg-panel',
                )}
              >
                <MiniSprite dex={p.dex} size={40} alt="" />
                <span className="flex min-w-0 flex-col leading-none">
                  <span className="truncate text-xl">{name}</span>
                  <span className="font-pixel-sm text-base text-muted">
                    {t('ui.common.level.short', { n: clone.level })}
                    {p.level > clone.level && ` (${p.level})`}
                    {manyRegions && ` · ${getRegion(data, region)?.name ?? region}`}
                  </span>
                </span>
                {order >= 0 && (
                  <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center border-2 border-ink bg-panel text-lg leading-none">
                    {order + 1}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex gap-2">
        <PixelButton variant="ghost" size="md" disabled={!valid.length || saving} onClick={() => setPicks([])}>
          {t('ui.versus.clear')}
        </PixelButton>
        <PixelButton
          variant="primary"
          size="md"
          className="flex-1"
          disabled={!signedIn || valid.length !== VERSUS_TEAM_SIZE || saving || isSaved}
          onClick={() => void submit()}
        >
          {saving ? (
            t('ui.common.loading')
          ) : isSaved ? (
            <>
              <PixelIcon name="check" size={16} /> {t('ui.versus.isSaved')}
            </>
          ) : (
            t('ui.versus.save')
          )}
        </PixelButton>
      </div>
    </div>
  )
}

function Board({ rows }: { rows: VersusEntry[] }) {
  const { t, tPlural } = useT()
  const [tab, setTab] = useState<VersusBoardTab>('attack')
  const ranked = useMemo(() => rankVersus(rows, tab), [rows, tab])
  const meRef = useSnapToMe(`${tab}:${ranked.findIndex((r) => r.isMe)}`)
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label={t('ui.board.sortBy')} className="grid grid-cols-2 gap-1.5">
        {(['attack', 'defense'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx('pixel-btn min-h-[44px] px-1 text-lg leading-none sm:text-xl', tab === id ? 'bg-gold' : 'bg-panel')}
          >
            {t(id === 'attack' ? 'ui.versus.tabAttack' : 'ui.versus.tabDefense')}
          </button>
        ))}
      </div>
      <p className="text-center text-lg text-muted">{t(tab === 'attack' ? 'ui.versus.boardAttack' : 'ui.versus.boardDefense')}</p>
      {ranked.length === 0 && <p className="p-4 text-center text-2xl text-muted">{t('ui.versus.boardEmpty')}</p>}
      <ol className="flex flex-col gap-2">
        {ranked.map((r) => (
          <li
            key={r.userId}
            ref={r.isMe ? meRef : undefined}
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
                <span className={cx('font-pixel-sm text-base leading-tight', r.isMe ? 'text-ink' : 'text-muted')}>
                  {tPlural('ui.versus.wins', r.score)}
                </span>
              </div>
              <TeamStrip team={r.team} name={r.name} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Battle ids for the replay's slices: apart from the run's, so a remount never mistakes one for the other. */
let replaySeq = 1_000_000

/** One precomputed fight, played back battle by battle on the battle screen, at Versus speed. */
function VersusFightView({ fight, foe, onExit }: { fight: VersusFight; foe: VersusEntry; onExit: () => void }) {
  const { t } = useT()
  const [roundIndex, setRoundIndex] = useState(0)
  const round = fight.rounds[roundIndex]!
  const [slice, setSlice] = useState<BattleSlice>(() => ({ state: round.start.state, log: round.start.log, id: ++replaySeq }))
  const [over, setOver] = useState(false)
  const cursor = useRef(0)
  const won = fight.winner === 'attacker'

  // The next battle, once this one has played out and the moment has sunk in.
  const onPlayed = useCallback(() => {
    if (roundIndex + 1 >= fight.rounds.length) {
      setOver(true)
      return
    }
    const next = fight.rounds[roundIndex + 1]!
    const timer = setTimeout(() => {
      cursor.current = 0
      setRoundIndex(roundIndex + 1)
      setSlice({ state: next.start.state, log: next.start.log, id: ++replaySeq })
    }, 700)
    return () => clearTimeout(timer)
  }, [fight, roundIndex])

  const replay: VersusReplay = {
    dispatch: (e: BattleEvent) => {
      const step = round.steps[cursor.current]
      if (!step || !sameEvent(step.event, e)) return
      cursor.current += 1
      setSlice((s) => ({ ...s, state: step.state, log: [...s.log, ...step.log] }))
    },
    nextMove: () => versusMoveAt(round, cursor.current),
    trainerName: foe.name,
    trainerSprite: avatarOf(foe.avatar).src,
    foeCount: foe.team.length,
    foeIndex: round.defenderIndex,
    onPlayed,
    end: over ? (
      <Overlay
        footer={
          <PixelButton variant="primary" size="lg" className="w-full" onClick={onExit}>
            {t('ui.versus.back')}
          </PixelButton>
        }
      >
        <div className="mb-2 text-center text-4xl">{t(won ? 'ui.versus.won.title' : 'ui.versus.lost.title')}</div>
        <div className="mb-2 flex justify-center">
          <TrainerSprite src={avatarOf(foe.avatar).src} size={72} />
        </div>
        <p className="copy text-center text-lg">{t(won ? 'ui.versus.won.body' : 'ui.versus.lost.body', { name: foe.name })}</p>
      </Overlay>
    ) : undefined,
  }

  return <BattleView key={slice.id} battle={slice} versus={replay} />
}
