// A Friend Battle as it happens (docs/65; docs/15 §50), `/battles/live`: your challenge waiting for its answer, the
// draft (the coin, then the picks), the team's order (Classic's ready step), the fight on the battle screen, and the
// result. Each step's time runs on the server; the store watches it and asks the server to act past it.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  autoEvents,
  createRng,
  draftChoices,
  draftOrder,
  draftTurn,
  friendBattlesFor,
  getSpecies,
  pvpLogFor,
  pvpStanding,
  pvpView,
  randomSeed,
  sameMon,
  versusEdge,
  VERSUS_LEVEL,
  type BattleEvent,
  type DraftMon,
  type LogEntry,
  type PvpEntry,
  type PvpSide,
} from '@/engine'
import { BottomDock } from '@/components/BottomDock'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { SpriteImg } from '@/components/SpriteImg'
import { TypeBadge } from '@/components/TypeBadge'
import { ShieldTag } from '@/components/pvp/ShieldTag'
import {
  AWAY_NOTICE_S,
  DropNotice,
  ModeTag,
  TimeChip,
  TimeGauge,
  TrainerBadge,
  useAwaySeconds,
  useSecondsLeft,
  VsRow,
} from '@/components/pvp/FriendBattleBits'
import { challengeError } from '@/components/pvp/ChallengeSheet'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { useMotion } from '@/lib/motion'
import type { PvpInfo } from '@/lib/pvp'
import { BattleView, type VersusReplay } from '@/screens/battle/BattleView'
import { headToHead } from '@/screens/Battles'
import { pushToast, useGame, type BattleSlice } from '@/store/game'
import {
  cancelChallenge,
  challenge,
  foeOf,
  leaveMatch,
  loadHome,
  pick,
  sendMove,
  setOrder,
  usePvp,
} from '@/store/pvp'
import { cx } from '@/theme/util'

export function BattleLiveScreen() {
  const { t } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const match = usePvp((s) => s.match)
  const engine = usePvp((s) => s.engine)
  if (!save) return null
  if (!friendBattlesFor(save, data)) return <Navigate to="/friends" replace />
  if (!match)
    return (
      <Note
        heading
        text={t('ui.pvp.noMatch')}
        action={<PixelButton onClick={() => navigate('/battles')}>{t('ui.pvp.toBattles')}</PixelButton>}
      />
    )
  // The fight is the battle screen, with its own heading; every other step gets the page's.
  if (engine && ['battle', 'done', 'void'].includes(match.state)) return <PvpFight key={match.id} match={match} />
  return (
    <>
      <h1 className="sr-only">{t('ui.pvp.title')}</h1>
      {match.state === 'invited' ? (
        <WaitingStep match={match} />
      ) : match.state === 'draft' ? (
        <DraftStep key={match.id} match={match} />
      ) : match.state === 'order' ? (
        <OrderStep key={match.id} match={match} />
      ) : (
        <Outcome match={match} />
      )}
    </>
  )
}

function Note({ text, action, heading }: { text: string; action?: ReactNode; heading?: boolean }) {
  const { t } = useT()
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 bg-paper px-3.5 py-5 text-center shadow-card">
      {heading && <h1 className="sr-only">{t('ui.pvp.title')}</h1>}
      <PixelIcon name="vs" size={48} />
      <p className="m-0 text-[20px] leading-[1.15]">{text}</p>
      {action}
    </div>
  )
}

/** The other player gone quiet for a while: the notice, with the time left before you win. */
function FoeAway({ match, className }: { match: PvpInfo; className?: string }) {
  const away = useAwaySeconds(match.foeSeen)
  if (away == null || away < AWAY_NOTICE_S) return null
  const grace = match.cfg.grace
  return <DropNotice name={foeOf(match).name} left={Math.max(0, grace - away)} total={grace} className={className} />
}

/** The page's head over every step: the mode, who against, the step's seconds. */
function StepHead({ match, title, seconds }: { match: PvpInfo; title: string; seconds: number | null }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2">
      <ModeTag mode={match.mode} />
      <span className="truncate font-pixel-sm text-[16px] text-muted">{t('ui.pvp.vs', { name: foeOf(match).name })}</span>
      <span className="flex-1" />
      <TimeChip seconds={seconds} />
      <span className="sr-only">{title}</span>
    </div>
  )
}

const me = (m: PvpInfo) => (m.side === 'a' ? m.a : m.b)

// ---------------------------------------------------------------- waiting, outcomes

export function WaitingStep({ match }: { match: PvpInfo }) {
  const { t } = useT()
  const seconds = useSecondsLeft(match.deadline)
  const foe = foeOf(match)
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <StepHead match={match} title={t('ui.pvp.waitingFor', { name: foe.name })} seconds={null} />
      <div className="flex flex-col items-center gap-4 bg-panel p-4 pb-5 shadow-card">
        <VsRow me={me(match)} foe={foe} foeDim />
        <p className="m-0 text-[26px] leading-none">{t('ui.pvp.waitingFor', { name: foe.name })}</p>
        <TimeGauge seconds={seconds} total={match.cfg.expiry} label={t('ui.pvp.sent')} />
        <PixelButton className="w-full" onClick={() => void cancelChallenge()}>
          {t('ui.common.cancel')}
        </PixelButton>
      </div>
    </div>
  )
}

export function Outcome({ match }: { match: PvpInfo }) {
  const { t } = useT()
  const navigate = useNavigate()
  const foe = foeOf(match)
  const key =
    match.state === 'declined'
      ? match.side === 'a'
        ? 'ui.pvp.out.declined'
        : 'ui.pvp.out.youDeclined'
      : match.state === 'expired'
        ? 'ui.pvp.out.expired'
        : match.state === 'cancelled'
          ? 'ui.pvp.out.cancelled'
          : match.state === 'void'
            ? 'ui.pvp.out.void'
            : match.winner === match.side
              ? 'ui.pvp.out.won'
              : 'ui.pvp.out.lost'
  return (
    <Note
      text={t(key, { name: foe.name })}
      action={
        <PixelButton
          onClick={() => {
            leaveMatch()
            navigate('/friends')
          }}
        >
          {t('ui.pvp.toFriends')}
        </PixelButton>
      }
    />
  )
}

// ---------------------------------------------------------------- the coin

const coinShown = new Set<number>()

/** The server's toss, played once per match on this device: the coin flips up and lands on the first picker's face. */
export function CoinToss({ match, onDone }: { match: PvpInfo; onDone: () => void }) {
  const { t } = useT()
  const { calm } = useMotion()
  const [frame, setFrame] = useState(calm ? 14 : 0)
  const mine = match.firstPicker === match.side
  // Read through a ref: the page re-renders every quarter second (its clock), and a new callback mustn't restart the wait.
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (frame >= 14) {
      const id = setTimeout(() => done.current(), 2200)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setFrame((f) => f + 1), 100)
    return () => clearTimeout(id)
  }, [frame])
  const landed = frame >= 14
  const lift = landed ? 0 : Math.round(Math.sin((frame / 14) * Math.PI) * 130)
  const heads = landed ? match.firstPicker === 'a' : frame % 2 === 0
  const first = match.firstPicker === 'a' ? match.a : match.b
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 pt-2">
      <h2 className="m-0 text-title leading-none">{t('ui.pvp.coin')}</h2>
      <div className="flex gap-10">
        <span className={cx('p-1', landed && match.firstPicker === 'a' && 'shadow-card-gold')}>
          <TrainerBadge player={match.a} label={match.side === 'a' ? t('ui.pvp.you') : match.a.name} size={80} />
          <span className="block text-center font-pixel-sm text-[16px] text-muted">{t('ui.pvp.heads')}</span>
        </span>
        <span className={cx('p-1', landed && match.firstPicker === 'b' && 'shadow-card-gold')}>
          <TrainerBadge player={match.b} label={match.side === 'b' ? t('ui.pvp.you') : match.b.name} size={80} />
          <span className="block text-center font-pixel-sm text-[16px] text-muted">{t('ui.pvp.tails')}</span>
        </span>
      </div>
      <div className="grid h-[272px] items-end" aria-hidden>
        <span
          className="light-scope grid h-[132px] w-[132px] place-items-center rounded-full bg-gold shadow-[0_0_0_4px_#24304f,inset_0_-8px_0_#d99a12,inset_0_6px_0_#ffe7a8]"
          style={{ transform: `translateY(${-lift}px) scaleX(${landed || frame % 2 === 0 ? 1 : -1})` }}
        >
          <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-gold-light shadow-[0_0_0_4px_#8a5a00]">
            <span className="font-pixel text-[30px] leading-none text-ink">{heads ? 'H' : 'T'}</span>
          </span>
        </span>
      </div>
      <p className="m-0 min-h-[32px] text-center text-[30px] leading-none" aria-live="polite">
        {landed &&
          t(mine ? 'ui.pvp.youFirst' : 'ui.pvp.theyFirst', {
            face: t(match.firstPicker === 'a' ? 'ui.pvp.heads' : 'ui.pvp.tails'),
            name: first.name,
          })}
      </p>
      {landed && (
        <div className="flex w-full items-start gap-2.5 bg-sky p-3 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_-4px_0_rgb(var(--c-sky-line))]">
          <ShieldTag />
          <span className="grid gap-0.5">
            <b className="text-[20px] font-normal leading-tight">
              {mine ? t('ui.pvp.shieldYours') : t('ui.pvp.shieldTheirs', { name: first.name })}
            </b>
            <small className="font-pixel-sm text-[16px] leading-tight">{t('ui.pvp.shieldWhy', { pct: 100 - match.cfg.shield })}</small>
          </span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the draft

function speciesName(data: ReturnType<typeof useGame.getState>['data'], dex: number) {
  return data.species[dex]?.name ?? `#${dex}`
}

function DraftSlots({ picks, side, label, shield }: { picks: DraftMon[]; side: string; label: string; shield: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="grid w-[64px] shrink-0 gap-1">
        <span className="truncate text-[18px] leading-none">{label}</span>
        {shield && <ShieldTag />}
      </span>
      {[0, 1, 2].map((i) => {
        const p = picks[i]
        return (
          <span
            key={`${side}${i}`}
            className={cx(
              'relative grid h-16 w-16 shrink-0 place-items-center',
              p ? 'bg-paper shadow-card' : 'bg-well shadow-[inset_0_0_0_2px_rgb(var(--c-shadow))]',
            )}
          >
            {p && <SpriteImg dex={p.dex} shiny={p.shiny} size={56} alt={`${p.dex}`} />}
          </span>
        )
      })}
    </div>
  )
}

export function DraftStep({ match, inline = false }: { match: PvpInfo; inline?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const pending = usePvp((s) => s.pending)
  const [coinDone, setCoinDone] = useState(() => coinShown.has(match.id) || match.picks.length > 0)
  const seconds = useSecondsLeft(match.deadline)
  const [chosen, setChosen] = useState<DraftMon | null>(null)
  const [search, setSearch] = useState('')
  const foe = foeOf(match)
  const side = match.side
  const turn = draftTurn(match.firstPicker ?? 'a', match.picks.length)
  const myTurn = turn === side
  const mine = match.picks.filter((p) => p.side === side)
  const theirs = match.picks.filter((p) => p.side !== side)
  const choices = draftChoices(match.cand, mine, theirs)
  const order = draftOrder(match.firstPicker ?? 'a')
  // Their last pick, said for a moment as it lands.
  const [landed, setLanded] = useState<DraftMon | null>(null)
  const seenTheirs = useRef(theirs.length)
  useEffect(() => {
    if (theirs.length > seenTheirs.current) {
      setLanded(theirs[theirs.length - 1]!)
      const id = setTimeout(() => setLanded(null), 2600)
      seenTheirs.current = theirs.length
      return () => clearTimeout(id)
    }
    seenTheirs.current = theirs.length
  }, [theirs])
  useEffect(() => setChosen(null), [match.picks.length])

  if (!coinDone)
    return (
      <CoinToss
        match={match}
        onDone={() => {
          coinShown.add(match.id)
          setCoinDone(true)
        }}
      />
    )

  const q = search.trim().toLowerCase()
  const listed = match.cand
    .filter((c) => !mine.some((m) => m.dex === c.dex))
    .filter((c) => !q || speciesName(data, c.dex).toLowerCase().includes(q))
  const foeDexes = theirs.map((p) => p.dex)
  const go = async () => {
    if (!chosen) return
    const code = await pick(chosen)
    if (code) pushToast(t('ui.pvp.err.failed'), 'bad')
  }

  return (
    <div className={cx('mx-auto flex w-full max-w-xl flex-col gap-2.5', !inline && 'pb-28')}>
      <StepHead match={match} title={t('ui.pvp.draft')} seconds={seconds} />
      <FoeAway match={match} />
      <section className="flex flex-col gap-2 bg-panel p-2.5 shadow-card">
        <div className="flex items-baseline justify-between">
          <span className="text-[24px] leading-none">
            {myTurn ? t('ui.pvp.yourPick') : t('ui.pvp.theyPick', { name: foe.name })}
          </span>
          <span className="font-pixel-sm text-[16px] text-muted">
            {t('ui.pvp.pickOf', { n: Math.min(6, match.picks.length + 1) })}
          </span>
        </div>
        <DraftSlots picks={mine} side="me" label={t('ui.pvp.you')} shield={match.firstPicker === side} />
        <DraftSlots picks={theirs} side="foe" label={foe.name} shield={match.firstPicker !== side} />
        <ol className="m-0 grid list-none grid-cols-6 gap-1 p-0" aria-label={t('ui.pvp.pickOrder')}>
          {order.map((s, i) => (
            <li
              key={i}
              className={cx(
                'py-0.5 text-center font-pixel-sm text-[14px] uppercase',
                i < match.picks.length
                  ? 'bg-well text-muted shadow-ring-line'
                  : i === match.picks.length
                    ? cx('light-scope text-white shadow-ring', s === side ? 'bg-crimson' : 'bg-[#2f6bc4]')
                    : 'bg-paper shadow-ring-thin',
              )}
            >
              {s === side ? t('ui.pvp.you') : foe.name}
            </li>
          ))}
        </ol>
      </section>

      {landed && (
        <div role="status" className="flex items-center gap-3 bg-paper p-2.5 shadow-[inset_0_0_0_2px_rgb(var(--c-edge)),inset_0_0_0_4px_rgb(var(--c-sky-line))]">
          <SpriteImg dex={landed.dex} shiny={landed.shiny} size={56} alt="" />
          <span className="text-[22px] leading-tight">
            {t('ui.pvp.theyPicked', { name: foe.name, mon: speciesName(data, landed.dex) })}
          </span>
        </div>
      )}

      <input
        className="min-h-[44px] w-full bg-paper px-3 text-[18px] shadow-field"
        placeholder={t('ui.pvp.search')}
        aria-label={t('ui.pvp.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className={cx('m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2', !myTurn && 'opacity-60')}>
        {listed.map((c) => {
          const free = choices.some((x) => sameMon(x, c))
          const taken = theirs.some((p) => p.dex === c.dex)
          const sp = getSpecies(data, c.dex)
          const hits = versusEdge([c.dex], foeDexes, data)
          const picked = chosen && sameMon(chosen, c)
          if (!free || (taken && !free))
            return (
              <li key={`${c.dex}${c.shiny}`} className="hatched flex items-center gap-2 p-1.5">
                <SpriteImg dex={c.dex} shiny={c.shiny} size={44} alt="" className="opacity-60 grayscale" />
                <span className="grid">
                  <span className="text-[19px] leading-none text-muted">{sp.name}</span>
                  <small className="font-pixel-sm text-[16px] text-muted">{t('ui.pvp.takenBy', { name: foe.name })}</small>
                </span>
              </li>
            )
          return (
            <li key={`${c.dex}${c.shiny}`}>
              <button
                type="button"
                disabled={!myTurn || pending}
                aria-pressed={!!picked}
                onClick={() => setChosen(c)}
                className={cx(
                  'flex w-full items-center gap-2 p-1.5 pb-2 text-left',
                  picked ? 'bg-cream shadow-card-gold' : 'bg-paper shadow-card',
                )}
              >
                <SpriteImg dex={c.dex} shiny={c.shiny} size={44} alt="" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="truncate text-[19px] leading-none">{sp.name}</span>
                    {[sp.type1, sp.type2].filter((ty) => !!ty).map((ty) => (
                      <TypeBadge key={ty} type={ty!} size="sm" />
                    ))}
                  </span>
                  <small className={cx('font-pixel-sm text-[16px]', hits > 0 ? 'text-good' : 'text-muted')}>
                    {hits > 0
                      ? t('ui.pvp.hits', { n: hits, total: foeDexes.length })
                      : t('ui.pvp.levelTo', { a: c.level, b: Math.min(c.level, VERSUS_LEVEL) })}
                  </small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div
        className={cx(
          'bg-panel px-3 pb-3 pt-2 shadow-[0_-2px_0_rgb(var(--c-edge))]',
          !inline && 'fixed inset-x-0 bottom-[var(--bottom-nav,64px)] z-30 mx-auto max-w-xl',
        )}
      >
        {myTurn ? (
          <PixelButton variant="primary" size="lg" className="w-full" disabled={!chosen || pending} onClick={() => void go()}>
            {chosen ? t('ui.pvp.pickName', { name: speciesName(data, chosen.dex) }) : t('ui.pvp.pickOne')}
          </PixelButton>
        ) : (
          <PixelButton size="lg" className="w-full" disabled>
            {t('ui.pvp.theirTurn', { name: foe.name })}
          </PixelButton>
        )}
        <p className="m-0 mt-1 text-center font-pixel-sm text-[16px] text-muted">{t('ui.pvp.pickTimeout')}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the order (and Classic's ready)

export function OrderStep({ match, inline = false }: { match: PvpInfo; inline?: boolean }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const pending = usePvp((s) => s.pending)
  const seconds = useSecondsLeft(match.deadline)
  const [order, setOrd] = useState<number[]>(() => match.team.map((_, i) => i))
  const [held, setHeld] = useState<number | null>(null)
  const foe = foeOf(match)
  const ready = match.side === 'a' ? match.readyA : match.readyB
  const foeReady = match.side === 'a' ? match.readyB : match.readyA
  const draft = match.mode === 'draft'
  const foePicks = match.picks.filter((p) => p.side !== match.side)
  const foeDexes = foePicks.map((p) => p.dex)
  const tap = (i: number) => {
    if (ready) return
    if (held == null) return setHeld(i)
    const next = [...order]
    ;[next[held], next[i]] = [next[i]!, next[held]!]
    setOrd(next)
    setHeld(null)
  }
  return (
    <div className={cx('mx-auto flex w-full max-w-md flex-col gap-3', !inline && 'pb-28')}>
      <StepHead match={match} title={draft ? t('ui.pvp.orderTitle') : t('ui.pvp.readyTitle')} seconds={seconds} />
      <FoeAway match={match} />
      <h2 className="m-0 text-title leading-none">{draft ? t('ui.pvp.orderTitle') : t('ui.pvp.readyTitle')}</h2>
      <p className="copy m-0 text-[18px] text-muted">{t(draft ? 'ui.pvp.orderHint' : 'ui.pvp.readyHint', { name: foe.name })}</p>

      <section className="flex flex-col gap-2 bg-paper p-2.5 pb-3 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-[20px] leading-none">{t('ui.pvp.theirTeam', { name: foe.name })}</span>
          <span className={cx('font-pixel-sm text-[16px]', foeReady ? 'text-good' : 'text-muted')}>
            {foeReady ? t('ui.pvp.ready') : t('ui.pvp.choosing')}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          {draft
            ? foePicks.map((p, i) => <SpriteImg key={i} dex={p.dex} shiny={p.shiny} size={60} alt={speciesName(data, p.dex)} />)
            : [0, 1, 2].map((i) => <PixelIcon key={i} name="ball" size={48} title={t('ui.pvp.hidden')} />)}
        </div>
        <span className="text-center font-pixel-sm text-[16px] text-muted">
          {draft ? t('ui.pvp.orderHidden') : t('ui.pvp.teamHidden')}
        </span>
      </section>

      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[24px] font-normal leading-none">{t('ui.pvp.yourTeam')}</h2>
        {draft && match.firstPicker === match.side && <ShieldTag />}
      </div>
      <ol className="m-0 grid list-none gap-1.5 p-0" aria-label={t('ui.pvp.yourTeam')}>
        {order.map((idx, pos) => {
          const m = match.team[idx]!
          const sp = getSpecies(data, m.dex)
          const hits = foeDexes.length ? versusEdge([m.dex], foeDexes, data) : null
          return (
            <li key={idx}>
              <button
                type="button"
                disabled={ready}
                aria-pressed={held === pos}
                onClick={() => tap(pos)}
                className={cx(
                  'flex w-full items-center gap-2 p-1.5 pb-2 text-left',
                  held === pos ? 'bg-cream shadow-card-gold' : pos === 0 ? 'bg-gold-pale shadow-card' : 'bg-paper shadow-card',
                )}
              >
                <span
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center text-[22px] leading-none',
                    pos === 0 ? 'light-scope bg-crimson text-white' : 'bg-ink text-panel',
                  )}
                >
                  {pos + 1}
                </span>
                <SpriteImg dex={m.dex} shiny={m.shiny} size={52} alt="" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-center gap-1.5 text-[20px] leading-none">
                    {sp.name}
                    {pos === 0 && <span className="light-scope bg-gold px-1 font-pixel-sm text-[14px] uppercase text-ink">{t('ui.pvp.lead')}</span>}
                  </span>
                  <small className={cx('font-pixel-sm text-[16px]', hits ? 'text-good' : 'text-muted')}>
                    {hits
                      ? t('ui.pvp.hits', { n: hits, total: foeDexes.length })
                      : t('ui.pvp.levelTo', { a: m.level, b: Math.min(m.level, VERSUS_LEVEL) })}
                  </small>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="m-0 text-center font-pixel-sm text-[16px] text-muted">{t('ui.pvp.swapHint')}</p>

      <div
        className={cx(
          'bg-panel px-3 pb-3 pt-2 shadow-[0_-2px_0_rgb(var(--c-edge))]',
          !inline && 'fixed inset-x-0 bottom-[var(--bottom-nav,64px)] z-30 mx-auto max-w-md',
        )}
      >
        <PixelButton
          variant={ready ? 'secondary' : 'primary'}
          size="lg"
          className="w-full"
          disabled={ready || pending}
          onClick={() => void setOrder(order)}
        >
          {ready ? t('ui.pvp.waitingFor', { name: foe.name }) : t('ui.pvp.readyButton')}
        </PixelButton>
        <p className="m-0 mt-1 text-center font-pixel-sm text-[16px] text-muted">{t('ui.pvp.orderTimeout')}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the fight

let sliceSeq = 3_000_000
const autoRng = createRng(randomSeed())

/** The log as the battle screen takes it: your next Pokémon coming out is a free switch; the other's opens a battle. */
function forScreen(entries: PvpEntry[]): LogEntry[] {
  return entries.map((e) => (e.kind === 'pvp_out' ? ({ kind: 'switch', uid: e.uid, free: true } as LogEntry) : e))
}

function PvpFight({ match }: { match: PvpInfo }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const engine = usePvp((s) => s.engine)!
  const log = usePvp((s) => s.log)
  const pending = usePvp((s) => s.pending)
  const applied = usePvp((s) => s.applied)
  const viewer: PvpSide = match.side
  const foe = foeOf(match)
  const viewLog = useMemo(() => pvpLogFor(log, viewer), [log, viewer])
  // The battle screen fights one of their Pokémon at a time, as Versus does: each of theirs coming out opens the next.
  const bounds = useMemo(
    () => viewLog.flatMap((e, i) => (e.kind === 'pvp_out' && e.side === 'enemy' ? [i] : [])),
    [viewLog],
  )
  const [n, setN] = useState(0)
  const ids = useRef<number[]>([])
  ids.current[n] ??= ++sliceSeq
  const start = n === 0 ? 0 : bounds[n - 1]! + 1
  const end = bounds[n] ?? viewLog.length
  const foeUid =
    n === 0 ? `${viewer === 'a' ? 'b' : 'a'}0` : (viewLog[bounds[n - 1]!] as Extract<PvpEntry, { kind: 'pvp_out' }>).uid
  const segment = viewLog.slice(start, end)
  const firstTurn = segment.find((e) => e.kind === 'turn') as Extract<LogEntry, { kind: 'turn' }> | undefined
  const sliceLog: LogEntry[] =
    n === 0 ? forScreen(segment) : [{ kind: 'start', first: firstTurn?.side ?? 'player' }, ...forScreen(segment)]
  // Your dice picks before a reroll, kept on this screen only.
  const [picked, setPicked] = useState<boolean[]>([])
  useEffect(() => setPicked([]), [applied])
  const view = pvpView(engine, viewer, data, foeUid)
  const myTurn = view.phase === 'player_reroll'
  const state = myTurn ? { ...view, selected: view.dice.map((_, i) => !!picked[i]) } : view
  const slice: BattleSlice = { state, log: sliceLog, id: ids.current[n]! }
  const foeIndex = Math.max(0, Number(foeUid.slice(1)) || 0)
  const [auto, setAuto] = useState(false)
  const seconds = useSecondsLeft(match.deadline)
  const over = !!engine.winner

  useEffect(() => {
    if (over) void loadHome()
  }, [over])

  const replay: VersusReplay = {
    dispatch: (e: BattleEvent) => {
      if (pending) return
      if (e.t === 'TOGGLE_DIE' && myTurn) setPicked((p) => view.dice.map((_, i) => (i === e.i ? !p[i] : !!p[i])))
      else if (e.t === 'REROLL' && myTurn) {
        const mask = view.dice.map((_, i) => !!picked[i])
        if (mask.some(Boolean)) void sendMove({ k: 'reroll', mask })
      } else if (e.t === 'ATTACK' && myTurn) void sendMove({ k: 'attack' })
      else if (e.t === 'FORFEIT') void sendMove({ k: 'forfeit' })
      // The foe's turn (AI_TURN), the roll, a switch: the moves come from the other game, through the server.
    },
    nextMove: () => (myTurn && !pending ? autoEvents(state, data, autoRng) : []),
    trainerName: foe.name,
    trainerSprite: avatarOf(foe.avatar).src,
    foeCount: viewer === 'a' ? engine.b.length : engine.a.length,
    foeIndex,
    onPlayed: () => {
      if (bounds.length > n) {
        const id = setTimeout(() => setN((x) => x + 1), 700)
        return () => clearTimeout(id)
      }
    },
    live: { auto, onAuto: setAuto },
    noSwitch: true,
    onForfeit: () => void sendMove({ k: 'forfeit' }),
    end: over ? <PvpResult match={match} /> : undefined,
  }

  return (
    <>
      <BattleView key={slice.id} battle={slice} versus={replay} />
      {!over && <FoeAway match={match} className="fixed inset-x-2.5 top-[calc(var(--top-bar,56px)+44px)] z-40 mx-auto max-w-md" />}
      {!over && (
        <div className="pointer-events-none fixed right-2 top-[calc(var(--top-bar,56px)+6px)] z-40 flex items-center gap-1.5">
          <span className="light-scope bg-night px-2 py-0.5 font-pixel-sm text-[16px] leading-none text-panel">
            {myTurn ? t('ui.pvp.yourTurn') : t('ui.pvp.theirTurnShort', { name: foe.name })}
          </span>
          <TimeChip seconds={seconds} />
        </div>
      )}
    </>
  )
}

function PvpResult({ match }: { match: PvpInfo }) {
  const { t } = useT()
  const navigate = useNavigate()
  const engine = usePvp((s) => s.engine)
  const live = usePvp((s) => s.match)
  const home = usePvp((s) => s.home)
  const foe = foeOf(match)
  const winner = engine?.winner
  const result = winner === 'draw' ? 'draw' : winner === match.side ? 'win' : 'loss'
  const standing = engine ? pvpStanding(engine) : { a: 0, b: 0 }
  const left = match.side === 'a' ? standing.a : standing.b
  const rec = home?.records.find((r) => r.id === foe.id)
  const state = live?.id === match.id ? live.state : match.state
  const rematch = async () => {
    const mode = match.mode
    leaveMatch()
    const code = await challenge(foe.id, mode)
    if (code) {
      pushToast(challengeError(t, code, foe.name, mode), 'bad')
      navigate('/friends')
    }
  }
  return (
    <div className="flex flex-col items-center gap-2.5 py-2">
      <b
        className={cx(
          'font-pixel text-[48px] leading-none [-webkit-text-stroke:2px_rgb(var(--c-edge))]',
          result === 'win' ? 'text-gold' : result === 'loss' ? 'text-danger' : 'text-muted',
        )}
      >
        {t(`ui.pvp.big.${result}`)}
      </b>
      <span className="font-pixel-sm text-[16px] text-muted">
        {t('ui.pvp.vsLeft', { name: foe.name, n: left })}
        {engine?.reason === 'forfeit' && ` · ${t(result === 'win' ? 'ui.pvp.theyForfeit' : 'ui.pvp.youForfeit')}`}
      </span>
      {state === 'void' && <p className="m-0 text-center text-[18px] text-danger">{t('ui.pvp.out.void')}</p>}
      {state === 'battle' && <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.pvp.saving')}</p>}
      {rec && state === 'done' && (
        <span className="bg-cream px-3 py-1 text-[20px] shadow-card-gold">{headToHead(t, rec.wins, rec.losses, foe.name)}</span>
      )}
      <BottomDock className="w-full">
        <div className="grid w-full gap-2">
          <PixelButton variant="primary" className="w-full" onClick={() => void rematch()}>
            {t('ui.pvp.rematch')}
          </PixelButton>
          <PixelButton
            className="w-full"
            onClick={() => {
              leaveMatch()
              navigate('/friends')
            }}
          >
            {t('ui.pvp.toFriends')}
          </PixelButton>
        </div>
      </BottomDock>
    </div>
  )
}
