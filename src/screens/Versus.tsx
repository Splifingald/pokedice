// Versus: leave a team of three Lv.50 clones for other players to fight, fight theirs, and climb two boards — teams
// beaten in attack, fights won in defense. Every fight is decided and recorded before it plays (engine/versus).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cloneForVersus,
  getRegion,
  versusClosest,
  versusEdge,
  VERSUS_LEVEL,
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
} from '@/engine'
import { BoardRow, TeamIcons } from '@/components/BoardRow'
import { Chip } from '@/components/Chip'
import { GoogleAccountButton } from '@/components/GoogleAccountButton'
import { PixelIcon } from '@/components/icons'
import { PageHead } from '@/components/PageHead'
import { PixelButton } from '@/components/PixelButton'
import { FilterChips, SearchField, Seg } from '@/components/Segmented'
import { MiniSprite, SpriteImg } from '@/components/SpriteImg'
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
import { holdReload, pushSaveNow } from '@/store/sync'
import { cx } from '@/theme/util'
import { BattleView, type VersusReplay } from './battle/BattleView'

type Tab = 'fight' | 'team' | 'board'
type Load =
  | { state: 'loading' }
  | { state: 'ready'; rows: VersusEntry[] }
  | { state: 'offline' }
  | { state: 'error'; why: string }

/** A refusal of the database, said in the player's language. */
const errorText = (t: (k: string) => string, err: unknown) => t(`ui.versus.err.${versusErrorCode(err)}`)

export function VersusScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const auth = useGame((s) => s.auth)
  const [tab, setTab] = useState<Tab>('fight')
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [fight, setFight] = useState<{ fight: VersusFight; foe: VersusEntry; n: number } | null>(null)
  const fights = useRef(0)
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
      setFight({ fight: result, foe, n: ++fights.current })
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
        key={fight.n}
        fight={fight.fight}
        foe={fight.foe}
        busy={busy}
        onRematch={() => void startFight(fight.foe)}
        onExit={() => {
          setFight(null)
          refresh()
        }}
      />
    )

  if (!versusUnlocked(save, data) && !me) return <Locked />

  const toBeat = opponentsOf(rows).filter((r) => !r.beaten).length
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead title={t('ui.versus.title')} onBack={() => navigate('/home')}>
        <Chip tone="dark">{t('ui.versus.auto')}</Chip>
      </PageHead>
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.versus.intro')}</p>

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-gold-pale p-3 shadow-card-gold">
          <p className="m-0 text-[19px] leading-tight">{t('ui.versus.connect')}</p>
          <GoogleAccountButton />
        </div>
      )}

      <Seg
        tabs
        idPrefix="vs"
        label={t('ui.versus.title')}
        value={tab}
        onChange={setTab}
        options={[
          {
            id: 'fight',
            label: t('ui.versus.tabFight'),
            count: load.state === 'ready' && toBeat ? toBeat : undefined,
          },
          { id: 'team', label: t('ui.versus.tabTeam') },
          { id: 'board', label: t('ui.versus.tabBoard') },
        ]}
      />

      <div role="tabpanel" aria-labelledby={`vs-${tab}`} className="flex flex-col gap-2.5">
        {load.state === 'loading' && (
          <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.common.loading')}</p>
        )}
        {load.state === 'error' && <p className="m-0 p-4 text-center text-[20px] text-danger">{load.why}</p>}
        {load.state === 'offline' && (
          <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.versus.offline')}</p>
        )}
        {load.state === 'ready' && tab === 'fight' && (
          <Opponents
            rows={rows}
            me={me}
            signedIn={signedIn}
            busy={busy}
            onFight={startFight}
            onSetTeam={() => setTab('team')}
          />
        )}
        {load.state === 'ready' && tab === 'team' && (
          <TeamEditor me={me} signedIn={signedIn} reload={reload} />
        )}
        {load.state === 'ready' && tab === 'board' && <Board rows={rows} />}
      </div>
    </div>
  )
}

/** A thin progress bar: gold on its way, green once there. */
function Meter({ value, className }: { value: number; className?: string }) {
  const k = Math.max(0, Math.min(1, value))
  return (
    <span className={cx('relative block h-1.5 bg-line shadow-ring-line-thin', className)} aria-hidden>
      <i
        className={cx('absolute inset-y-0 left-0 block', k >= 1 ? 'bg-hp-green' : 'bg-gold')}
        style={{ width: `${k * 100}%` }}
      />
    </span>
  )
}

/** Versus is closed: how far the player is from opening it, and the three Pokémon closest to Lv.50. */
function Locked() {
  const { t } = useT()
  const navigate = useNavigate()
  const data = useGame((s) => s.data)
  const save = useGame((s) => s.save)!
  const count = Math.min(versusReadyCount(save, data), VERSUS_TEAM_SIZE)
  const closest = versusClosest(save, data)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <PageHead title={t('ui.versus.title')} onBack={() => navigate('/home')}>
        <Chip tone="dark">{t('ui.versus.auto')}</Chip>
      </PageHead>
      <div className="grid justify-items-center gap-2 bg-paper px-3.5 py-4 text-center shadow-card">
        <PixelIcon name="lock" size={36} />
        <b className="text-[21px] font-normal leading-[1.1]">{t('ui.versus.locked')}</b>
        <Meter value={count / VERSUS_TEAM_SIZE} className="h-2.5 w-[70%]" />
        <small className="font-pixel-sm text-[15px] text-muted">
          {t('ui.versus.lockedCount', { n: count })}
        </small>
      </div>
      {closest.length > 0 && (
        <>
          <h2 className="m-0 mt-1 text-[24px] font-normal leading-none">{t('ui.versus.closest')}</h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {closest.map(({ inst }) => {
              const name = data.species[inst.dex]?.name ?? t('ui.common.pokemon')
              const ready = inst.level >= VERSUS_LEVEL
              return (
                <li
                  key={inst.id}
                  className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 bg-paper pb-1 pl-0.5 pr-2.5 pt-0.5 shadow-ring-line"
                >
                  <MiniSprite dex={inst.dex} size={40} />
                  <b className="text-[18px] font-normal">{name}</b>
                  <Meter value={inst.level / VERSUS_LEVEL} />
                  <small className="font-pixel-sm text-[15px] text-muted">
                    {ready
                      ? t('ui.home.ready')
                      : t('ui.versus.toGo', {
                          level: t('ui.common.level.short', { n: inst.level }),
                          n: VERSUS_LEVEL - inst.level,
                        })}
                  </small>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">{t('ui.versus.intro')}</p>
    </div>
  )
}

type Show = 'tobeat' | 'beaten' | 'all'

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
  const data = useGame((s) => s.data)
  const [q, setQ] = useState('')
  const [show, setShow] = useState<Show>('all')
  const list = useMemo(() => opponentsOf(rows), [rows])
  const beaten = list.filter((r) => r.beaten).length
  const needle = searchFold(q.trim())
  const shown = list
    .filter((r) => (show === 'all' ? true : show === 'beaten' ? r.beaten : !r.beaten))
    .filter(
      (r) =>
        !needle ||
        searchFold(r.name).includes(needle) ||
        r.team.some((m) => searchFold(data.species[m.dex]?.name ?? '').includes(needle)),
    )
  const mine = me?.team.map((m) => m.dex) ?? []
  if (signedIn && !me)
    return (
      <div className="grid gap-2.5 bg-gold-pale p-3.5 text-center shadow-card-gold">
        <p className="m-0 text-[19px] leading-[1.15]">{t('ui.versus.noTeamYet')}</p>
        <PixelButton variant="primary" onClick={onSetTeam}>
          {t('ui.versus.setTeam')}
        </PixelButton>
      </div>
    )
  return (
    <>
      {me && (
        <div className="flex items-center gap-2 bg-paper py-1 pl-2.5 pr-1.5 shadow-ring-line">
          <span className="font-pixel-sm text-[15px] text-muted">{t('ui.versus.yourTeam')}</span>
          <TeamIcons team={me.team} owner={me.name} />
          <PixelButton size="sm" variant="ghost" className="ml-auto" onClick={onSetTeam}>
            {t('ui.versus.change')}
          </PixelButton>
        </div>
      )}
      {busy && <p className="m-0 text-center text-[19px] text-muted">{t('ui.versus.starting')}</p>}
      {list.length === 0 ? (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.versus.noOpponents')}</p>
      ) : (
        <>
          <SearchField
            id="vs-q"
            value={q}
            onChange={setQ}
            label={t('ui.versus.searchOpp')}
            placeholder={t('ui.versus.searchOpp')}
          />
          <FilterChips
            label={t('ui.versus.show')}
            value={show}
            onChange={setShow}
            options={[
              { id: 'tobeat', label: t('ui.versus.toBeat'), count: list.length - beaten },
              { id: 'beaten', label: t('ui.versus.beaten'), count: beaten },
              { id: 'all', label: t('ui.dex.fAll'), count: list.length },
            ]}
          />
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {shown.length === 0 && (
              <li className="p-3 text-center font-pixel-sm text-[16px] text-muted">
                {show === 'tobeat' && !needle ? t('ui.versus.allBeaten') : t('ui.versus.noTrainer')}
              </li>
            )}
            {shown.map((r) => {
              const edge = versusEdge(
                mine,
                r.team.map((m) => m.dex),
                data,
              )
              return (
                <BoardRow
                  key={r.userId}
                  look={avatarOf(r.avatar).src}
                  name={r.name}
                  team={r.team}
                  dim={r.beaten}
                  sub={
                    me && (
                      <small
                        className={cx(
                          'font-pixel-sm text-[13px] leading-[1.1]',
                          edge >= 2 ? 'text-good' : edge === 0 ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {edge
                          ? tPlural('ui.versus.edge', edge, { total: r.team.length })
                          : t('ui.versus.edgeNone')}
                      </small>
                    )
                  }
                >
                  {r.beaten ? (
                    <span title={t('ui.versus.beatenHint', { name: r.name })}>
                      <Chip tone="green">{t('ui.versus.beaten')}</Chip>
                    </span>
                  ) : (
                    <PixelButton
                      variant="primary"
                      size="sm"
                      className="shrink-0 px-3"
                      disabled={!me || busy}
                      aria-label={t('ui.versus.fightName', { name: r.name })}
                      onClick={() => onFight(r)}
                    >
                      {t('ui.versus.fight')}
                    </PixelButton>
                  )}
                </BoardRow>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

/** Three numbered slots in fight order, the eligible Pokémon (Lv.50+, every region's Box), Clear and Save. */
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
  const candidates = useMemo(
    () => [...versusCandidates(save, data)].sort((a, b) => b.inst.level - a.inst.level),
    [save, data],
  )
  // Several regions played: each Pokémon says which one it comes from.
  const manyRegions = new Set(candidates.map((c) => c.region)).size > 1
  // The search narrows the list by name; picks it hides stay picked.
  const needle = searchFold(q)
  const shown = needle
    ? candidates.filter((c) => searchFold(data.species[c.inst.dex]?.name ?? '').includes(needle))
    : candidates
  // A pick that has left the Box (released, or sent to the Day Care) is dropped.
  const valid = picks.filter((id) => candidates.some((c) => c.inst.id === id))
  // The picks are the team already saved: nothing to save.
  const isSaved = !!me?.ids && me.ids.length === valid.length && me.ids.every((id, i) => valid[i] === id)

  const toggle = (id: string) =>
    setPicks((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= VERSUS_TEAM_SIZE ? cur : [...cur, id],
    )

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
    <>
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
        {t('ui.versus.pickHint')} {t('ui.versus.rules')}
      </p>
      {!me && <p className="m-0 text-[18px] text-muted">{t('ui.versus.noTeam')}</p>}
      <ol className="m-0 grid list-none grid-cols-3 gap-1.5 p-0" aria-label={t('ui.versus.yourTeam')}>
        {Array.from({ length: VERSUS_TEAM_SIZE }, (_, i) => {
          const c = candidates.find((x) => x.inst.id === valid[i])
          const n = (
            <span className="light-scope absolute left-1.5 top-[5px] bg-night px-[5px] pb-0.5 pt-px font-pixel-sm text-[14px] leading-none text-gold-light">
              {i + 1}
            </span>
          )
          if (!c)
            return (
              <li
                key={i}
                className="relative grid min-h-[118px] place-content-center bg-well px-1 text-center font-pixel-sm text-[14px] text-ink shadow-ring-line"
              >
                {n}
                {t('ui.versus.slotEmpty')}
              </li>
            )
          const name = data.species[c.inst.dex]?.name ?? t('ui.common.pokemon')
          const clone = cloneForVersus(c.inst)
          return (
            <li
              key={i}
              className="relative grid min-h-[118px] justify-items-center gap-0.5 bg-paper px-1 pb-2 pt-[18px] text-center shadow-card"
            >
              {n}
              <SpriteImg dex={c.inst.dex} size={64} shiny={c.inst.shiny} />
              <b className="max-w-full truncate text-[17px] font-normal leading-none">{name}</b>
              <small className="font-pixel-sm text-[13px] text-muted">
                {c.inst.level > clone.level
                  ? `${t('ui.common.level.short', { n: c.inst.level })} → ${clone.level}`
                  : t('ui.common.level.short', { n: clone.level })}
              </small>
            </li>
          )
        })}
      </ol>

      <SearchField
        id="vs-team-q"
        value={q}
        onChange={setQ}
        label={t('ui.versus.searchLabel')}
        placeholder={t('ui.versus.search')}
      />
      {shown.length === 0 && (
        <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.search.noMatch')}</p>
      )}
      <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
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
                  'flex min-h-[52px] w-full items-center gap-2 py-1.5 pl-1.5 pr-2.5 text-left',
                  order >= 0 ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
                )}
              >
                <MiniSprite dex={p.dex} size={40} className="-my-1" />
                <span className="grid min-w-0 flex-1 leading-[1.05]">
                  <b className="truncate text-[18px] font-normal">{name}</b>
                  <small className="font-pixel-sm text-[14px] text-muted">
                    {t('ui.common.level.short', { n: clone.level })}
                    {p.level > clone.level && ` (${p.level})`}
                    {manyRegions && ` · ${getRegion(data, region)?.name ?? region}`}
                  </small>
                </span>
                {order >= 0 && (
                  <span className="grid h-7 w-7 light-scope shrink-0 place-items-center bg-night text-[18px] leading-none text-gold-light">
                    {order + 1}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
        <PixelButton disabled={!valid.length || saving} onClick={() => setPicks([])}>
          {t('ui.versus.clear')}
        </PixelButton>
        <PixelButton
          variant="primary"
          disabled={!signedIn || valid.length !== VERSUS_TEAM_SIZE || saving || isSaved}
          onClick={() => void submit()}
        >
          {saving ? t('ui.common.loading') : isSaved ? t('ui.versus.isSaved') : t('ui.versus.save')}
        </PixelButton>
      </div>
    </>
  )
}

/** The two Versus boards: teams beaten in attack (each counts once), fights won in defense. */
function Board({ rows }: { rows: VersusEntry[] }) {
  const { t, tPlural } = useT()
  const [tab, setTab] = useState<VersusBoardTab>('attack')
  const ranked = useMemo(() => rankVersus(rows, tab), [rows, tab])
  const meRef = useSnapToMe(`${tab}:${ranked.findIndex((r) => r.isMe)}`)
  return (
    <>
      <Seg
        tabs
        idPrefix="vsb"
        label={t('ui.board.sortBy')}
        value={tab}
        onChange={setTab}
        options={[
          { id: 'attack', label: t('ui.versus.tabAttack') },
          { id: 'defense', label: t('ui.versus.tabDefense') },
        ]}
      />
      <p className="m-0 font-pixel-sm text-[15px] leading-[1.15] text-muted">
        {t(tab === 'attack' ? 'ui.versus.boardAttack' : 'ui.versus.boardDefense')}
      </p>
      {ranked.length === 0 && (
        <p className="m-0 p-4 text-center text-[20px] text-muted">{t('ui.versus.boardEmpty')}</p>
      )}
      <ol className="m-0 grid list-none gap-1.5 p-0">
        {ranked.map((r) => (
          <BoardRow
            key={r.userId}
            rowRef={r.isMe ? meRef : undefined}
            rank={r.rank}
            look={avatarOf(r.avatar).src}
            name={r.name}
            isMe={r.isMe}
            team={r.team}
            value={
              <span className="font-pixel-sm text-[16px]">
                {tPlural(tab === 'attack' ? 'ui.versus.wins' : 'ui.versus.defenseWins', r.score)}
              </span>
            }
          />
        ))}
      </ol>
    </>
  )
}

/** Battle ids for the replay's slices: apart from the run's, so a remount never mistakes one for the other. */
let replaySeq = 1_000_000

/** One precomputed fight, played back battle by battle on the battle screen, at Versus speed. */
function VersusFightView({
  fight,
  foe,
  busy,
  onRematch,
  onExit,
}: {
  fight: VersusFight
  foe: VersusEntry
  /** A rematch is being computed and recorded. */
  busy: boolean
  onRematch: () => void
  onExit: () => void
}) {
  const { t } = useT()
  const [roundIndex, setRoundIndex] = useState(0)
  const round = fight.rounds[roundIndex]!
  const [slice, setSlice] = useState<BattleSlice>(() => ({
    state: round.start.state,
    log: round.start.log,
    id: ++replaySeq,
  }))
  const [over, setOver] = useState(false)
  // SKIP ▸▸: the result is decided before the fight starts, so skipping only plays the rest of the replay at once.
  const [fast, setFast] = useState(false)
  const cursor = useRef(0)
  const won = fight.winner === 'attacker'

  // A pending reload (new build, Admin → "Reload all players") waits for the end of the fight.
  useEffect(() => holdReload(), [])

  // The next battle, once this one has played out and the moment has sunk in.
  const onPlayed = useCallback(() => {
    if (roundIndex + 1 >= fight.rounds.length) {
      setOver(true)
      return
    }
    const next = fight.rounds[roundIndex + 1]!
    const timer = setTimeout(
      () => {
        cursor.current = 0
        setRoundIndex(roundIndex + 1)
        setSlice({ state: next.start.state, log: next.start.log, id: ++replaySeq })
      },
      fast ? 0 : 700,
    )
    return () => clearTimeout(timer)
  }, [fight, roundIndex, fast])

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
    fast,
    onSkip: () => setFast(true),
    end: over ? (
      <div className="grid gap-2 bg-paper p-3 shadow-card" role="status">
        <div className="flex items-center gap-2">
          <TrainerSprite src={avatarOf(foe.avatar).src} size={48} />
          <h2 className="m-0 text-[28px] font-normal leading-none">
            {t(won ? 'ui.versus.won.title' : 'ui.versus.lost.title')}
          </h2>
        </div>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t(won ? 'ui.versus.won.body' : 'ui.versus.lost.body', { name: foe.name })}
        </p>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
          <PixelButton size="lg" className="whitespace-nowrap px-2" disabled={busy} onClick={onRematch}>
            {t('ui.battle.rematch')}
          </PixelButton>
          <PixelButton variant="primary" size="lg" className="whitespace-nowrap px-2" onClick={onExit}>
            {t('ui.versus.back')}
          </PixelButton>
        </div>
      </div>
    ) : undefined,
  }

  return <BattleView key={slice.id} battle={slice} versus={replay} />
}
