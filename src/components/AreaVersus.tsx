// Real-player battles in areas (docs/53): the card that shows a real player's team before FIGHT or SKIP, its rules
// (once, the first time a card is turned over, and from INFO), the result card's friend request, the Friends page's
// requests, and the service that keeps a team ready for the area being played.
import { useEffect, useRef, useState } from 'react'
import {
  areaVersusConfig,
  areaVersusHere,
  daysAgo,
  familyTalent,
  foePrize,
  progressOf,
  type AreaFoe,
  type Encounter,
} from '@/engine'
import { feelSound } from '@/audio/feel'
import { artUrl } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { money } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { useIsDesktop } from '@/lib/useMediaQuery'
import {
  answerFriendRequest,
  clearAreaVersus,
  loadAreaFoe,
  sendFriendRequest,
  useAreaVersus,
  type AnswerStatus,
  type FriendRequest,
} from '@/store/areaVersus'
import { mutateSave, pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { FriendTag } from './friends/FriendBits'
import { PixelIcon } from './icons'
import { PixelButton } from './PixelButton'
import { RulesModal, type RuleRow } from './RulesModal'
import { MiniSprite } from './SpriteImg'
import { TalentGem } from './Talent'
import { TrainerSprite } from './TrainerArt'
import { TrainerLook } from './TrainerLook'
import { TrainerName } from './TrainerName'

/** Mounted with the game shell: a team asked for the area being played, once it opens (and again after each meet). */
export function AreaVersusService() {
  // The area being played, else the one Home's CONTINUE goes back to: its team asked before the first card.
  const areaId = useGame((s) => s.run.areaId ?? s.save?.currentAreaId ?? null)
  const here = useGame((s) =>
    areaVersusHere(
      s.save,
      s.data.areas.find((a) => a.id === areaId),
      s.data,
    ),
  )
  const status = useGame((s) => s.auth.status)
  const userId = useGame((s) => s.auth.userId)
  useEffect(() => {
    // Another account (or none): whose friend they are, and who was met, change with it.
    clearAreaVersus()
  }, [userId])
  useEffect(() => {
    if (here && status !== 'unknown') void loadAreaFoe(areaId)
  }, [areaId, here, status, userId])
  return null
}

/** The rules, with the admin's numbers. */
export function useAreaVersusRules(): RuleRow[] {
  const { t } = useT()
  // The data, then its numbers: a selector must not build a new object on every call.
  const cfg = areaVersusConfig(useGame((s) => s.data))
  return [
    { icon: 'user', title: t('ui.areaVersus.rule1Title'), text: t('ui.areaVersus.rule1Text') },
    { icon: 'heart', title: t('ui.areaVersus.rule2Title'), text: t('ui.areaVersus.rule2Text') },
    {
      icon: 'coin',
      title: t('ui.areaVersus.rule3Title', { x: cfg.prizeMultiplier }),
      text: t('ui.areaVersus.rule3Text', { x: cfg.prizeMultiplier }),
    },
    {
      icon: 'friends',
      title: t('ui.areaVersus.rule4Title'),
      text: t('ui.areaVersus.rule4Text', { days: cfg.requestDays }),
    },
  ]
}

/** Two trainers face to face over an open route: the rules' banner, drawn from the game's own pictures. */
function PlayersBanner() {
  const mine = useGame((s) => s.save?.player?.avatar ?? s.save?.player?.character ?? 'red')
  return (
    <>
      <img
        src={artUrl('hills')}
        alt=""
        className="pixelated absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 70%' }}
      />
      <span className="absolute inset-x-0 bottom-1 flex items-end justify-center gap-3" aria-hidden>
        <TrainerSprite src={avatarOf(mine).src} size={88} />
        <span className="mb-6 bg-night px-1.5 py-0.5 shadow-ring">
          <PixelIcon name="vs" size={24} />
        </span>
        <TrainerSprite
          src={avatarOf(mine === 'green' ? 'red' : 'green').src}
          size={88}
          style={{ transform: 'scaleX(-1)' }}
        />
      </span>
    </>
  )
}

/** The rules pop-up: `onGo` the first time (Later / Let's go!), without it INFO's copy (OK). */
export function AreaVersusRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useAreaVersusRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.areaVersus.rulesTitle')}
      picture={<PlayersBanner />}
      icon="user"
      rules={rules}
      onGo={onGo}
    />
  )
}

/** "REAL PLAYER": the card's tag, in the friends' blue, with a person (a word, never colour alone). */
export function RealPlayerTag({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 bg-sky px-1.5 pb-px font-pixel-sm text-[16px] leading-tight tracking-[0.08em] text-ink shadow-[inset_0_0_0_2px_#5b8def]',
        className,
      )}
    >
      <PixelIcon name="user" size={14} />
      {t('ui.areaVersus.tag')}
    </span>
  )
}

/** "Played here 2 days ago". */
export function usePlayedText() {
  const { t } = useT()
  return (at: number, now = Date.now()) => {
    const d = daysAgo(at, now)
    return d === 0
      ? t('ui.areaVersus.playedToday')
      : d === 1
        ? t('ui.areaVersus.playedYesterday')
        : t('ui.areaVersus.playedDays', { n: d })
  }
}

/** Their team, as it fights: each Pokémon's sprite, level, shine and talent. */
export function FoeTeam({
  team,
}: {
  team: { dex: number; level: number; shiny?: boolean; talent?: boolean }[]
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t('ui.areaVersus.theirTeam')}>
      {team.map((m, i) => (
        <li key={i} className="flex items-center gap-1 bg-paper py-0.5 pl-0.5 pr-1.5 shadow-ring">
          <MiniSprite dex={m.dex} size={40} />
          <span className="grid text-base leading-tight">
            <span className="flex items-center gap-1">
              {data.species[m.dex]?.name}
              {m.shiny && <PixelIcon name="star" size={12} title={t('ui.mon.shiny')} />}
              {m.talent && <TalentGem talent={familyTalent(data, m.dex)} size={12} />}
            </span>
            <span className="text-muted">{t('ui.common.level.short', { n: m.level })}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** How long the intro holds before it lifts away, and its end (ms): the full scene, or a still one when calm. */
const INTRO_MS = { full: [1500, 1700], calm: [900, 900] } as const

/**
 * The card's intro (the user's ask, 2026-10-31): your band slides in from the left, theirs from the right, VS pops and
 * "REAL PLAYER BATTLE!" types in, then the scene lifts off the card. Played in full under Short (an encounter's
 * intro, docs/15 §8), held still when calm, skipped with animations off; a tap ends it.
 */
export function RealPlayerIntro({ foe, onDone }: { foe: AreaFoe; onDone: () => void }) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const mine = useGame((s) => s.save?.player?.avatar ?? s.save?.player?.character ?? 'red')
  const [out, setOut] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (level === 'off') return done.current()
    if (!calm) feelSound('versus.intro')
    const [hold, end] = calm ? INTRO_MS.calm : INTRO_MS.full
    const lift = setTimeout(() => setOut(true), hold)
    const finish = setTimeout(() => done.current(), end)
    return () => {
      clearTimeout(lift)
      clearTimeout(finish)
    }
  }, [level, calm])
  if (level === 'off') return null
  return (
    <button
      type="button"
      data-testid="real-player-intro"
      onClick={() => done.current()}
      aria-label={t('ui.areaVersus.introSkip')}
      className={cx('absolute inset-0 z-20 overflow-hidden bg-night', out && !calm && 'rp-out')}
    >
      <span role="status" className="sr-only">
        {t('ui.areaVersus.intro', { name: foe.name })}
      </span>
      <span
        aria-hidden
        className="rp-band-left absolute inset-x-0 top-0 flex h-[55%] items-end bg-[#5b8def] pl-3 [clip-path:polygon(0_0,100%_0,100%_62%,0_100%)]"
      >
        <TrainerSprite src={avatarOf(mine).src} size={84} />
      </span>
      <span
        aria-hidden
        className="rp-band-right absolute inset-x-0 bottom-0 flex h-[55%] items-end justify-end gap-2 bg-[#f2553f] pr-3 [clip-path:polygon(0_38%,100%_0,100%_100%,0_100%)]"
      >
        <span className="mb-2 max-w-[45%] truncate font-pixel-sm text-[18px] leading-none text-white [text-shadow:2px_2px_0_#1b1f3b]">
          {foe.name}
        </span>
        <TrainerSprite src={foe.sprite ?? avatarOf(foe.avatar).src} size={84} />
      </span>
      <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="rp-pop flex items-center gap-1 bg-night px-2 py-1 shadow-[inset_0_0_0_3px_#ffbe2e]">
          <PixelIcon name="vs" size={28} />
        </span>
      </span>
      <span aria-hidden className="absolute inset-x-0 top-[calc(50%+26px)] flex justify-center">
        <span className="rp-type whitespace-nowrap bg-night px-2 pb-0.5 text-[26px] leading-none tracking-[0.12em] text-gold [text-shadow:2px_2px_0_#000]">
          {t('ui.areaVersus.introTitle')}
        </span>
      </span>
    </button>
  )
}

/** The card, in the encounter's pop-up: who, when, their team, what it pays, INFO; FIGHT and SKIP are the pop-up's. */
export function PlayerFoeCard({
  enc,
  areaId,
  firstRules = true,
  intro: withIntro = true,
}: {
  enc: Extract<Encounter, { kind: 'trainer' }> & { player: AreaFoe }
  /** The area it pays in: the run's, unless shown elsewhere (the kitchen sink). */
  areaId?: string
  /** The rules pop-up after the intro, the first time (off on the kitchen sink). */
  firstRules?: boolean
  /** Its intro first (the kitchen sink shows the card still too). */
  intro?: boolean
}) {
  const { t } = useT()
  const desktop = useIsDesktop()
  const data = useGame((s) => s.data)
  const where = useGame((s) => areaId ?? s.run.areaId)
  const area = data.areas.find((a) => a.id === where)
  const cleared = useGame((s) => !!s.save && !!where && progressOf(s.save, where).cleared)
  const seen = useGame((s) => !!s.save?.areaVersusRulesSeen) || !firstRules
  const played = usePlayedText()
  // The intro first (the user's ask), then, the first time, the rules.
  const [intro, setIntro] = useState(withIntro)
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  const endIntro = () => {
    setIntro(false)
    if (!seen) setRules('unlock')
  }
  const foe = enc.player
  const gold = area ? foePrize(enc.team, area, cleared, data) : 0
  const x = areaVersusConfig(data).prizeMultiplier
  const closeRules = () => {
    if (rules === 'unlock')
      mutateSave((s) => (s.areaVersusRulesSeen ? null : { ...s, areaVersusRulesSeen: true }))
    setRules(null)
  }
  return (
    <div className="relative flex min-h-[260px] flex-col gap-2.5">
      {intro && <RealPlayerIntro foe={foe} onDone={endIntro} />}
      <div className="flex items-center gap-3">
        <div className="-my-2 shrink-0 self-end">
          <TrainerSprite src={foe.sprite ?? avatarOf(foe.avatar).src} size={desktop ? 160 : 112} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <RealPlayerTag />
            {foe.friend && <FriendTag />}
          </div>
          <div className="truncate text-[30px] leading-none">
            <TrainerName name={foe.name} rich={foe.rich} />
          </div>
          <div className="text-lg leading-tight text-muted">{played(foe.playedAt)}</div>
        </div>
      </div>
      <FoeTeam team={enc.team} />
      <div className="flex items-start gap-2 bg-gold-pale px-2.5 py-1.5 text-ink shadow-card-gold">
        <PixelIcon name="coin" size={20} className="mt-0.5 shrink-0" />
        <span className="grid gap-0.5 leading-tight">
          <b className="text-xl font-normal leading-none">{t('ui.areaVersus.pays', { gold: money(gold) })}</b>
          <small className="font-pixel-sm text-[16px] text-muted">{t('ui.areaVersus.paysNote', { x })}</small>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.areaVersus.healNote')}
        </p>
        <PixelButton size="sm" className="shrink-0" onClick={() => setRules('info')}>
          {t('ui.lead.info')}
        </PixelButton>
      </div>
      <AreaVersusRulesModal
        open={rules != null}
        onClose={closeRules}
        onGo={rules === 'unlock' ? closeRules : undefined}
      />
    </div>
  )
}

/** SEND FRIEND REQUEST, and what became of it. Nothing for a friend already, or signed out (who would it be from?). */
export function FriendRequestButton({ foe, signedInAs }: { foe: AreaFoe; signedInAs?: boolean }) {
  const { t } = useT()
  const areaId = useGame((s) => s.run.areaId)
  const signedIn = useGame((s) => s.auth.status === 'signed_in') || !!signedInAs
  const sent = useAreaVersus((s) => s.sent[foe.id])
  const maxFriends = useGame((s) => s.data.config.maxFriends ?? 100)
  if (foe.friend)
    return (
      <p className="m-0 flex items-center gap-1.5 text-lg leading-tight">
        <FriendTag /> {t('ui.areaVersus.alreadyFriends', { name: foe.name })}
      </p>
    )
  if (!signedIn)
    return (
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
        {t('ui.areaVersus.signInToAdd')}
      </p>
    )
  if (sent && sent !== 'sending' && sent !== 'error') {
    const line =
      sent === 'sent' || sent === 'pending'
        ? t('ui.areaVersus.requestSent', { name: foe.name })
        : sent === 'added'
          ? t('ui.areaVersus.nowFriends', { name: foe.name })
          : sent === 'already'
            ? t('ui.areaVersus.alreadyFriends', { name: foe.name })
            : sent === 'full'
              ? t('ui.friends.full', { max: maxFriends })
              : sent === 'friend_full'
                ? t('ui.friends.friendFull', { name: foe.name })
                : t('ui.areaVersus.requestFailed')
    return (
      <p className="m-0 flex items-center gap-1.5 text-lg leading-tight" role="status">
        <PixelIcon
          name={
            sent === 'sent' || sent === 'pending' || sent === 'added' || sent === 'already'
              ? 'check'
              : 'warning'
          }
          size={18}
        />
        {line}
      </p>
    )
  }
  return (
    <div className="grid gap-1">
      <PixelButton
        className="w-full"
        disabled={sent === 'sending'}
        onClick={() => void sendFriendRequest(foe, areaId)}
      >
        <PixelIcon name="friends" size={20} />
        {t('ui.areaVersus.sendRequest')}
      </PixelButton>
      {sent === 'error' && (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-danger" role="alert">
          {t('ui.areaVersus.requestFailed')}
        </p>
      )}
    </div>
  )
}

/** The result card's real-player part (docs/53): who won, the heal, the friend request. */
export function DuelResult({
  outcome,
  foe,
  signedInAs,
}: {
  outcome: 'won' | 'lost'
  foe: AreaFoe
  signedInAs?: boolean
}) {
  const { t } = useT()
  return (
    <div className="flex flex-col gap-2 bg-paper p-2.5 shadow-ring">
      <div className="flex items-center gap-2.5">
        <TrainerLook src={foe.sprite ?? avatarOf(foe.avatar).src} w={44} h={48} />
        <div className="grid min-w-0 gap-1">
          <RealPlayerTag className="justify-self-start" />
          <b className="text-[22px] font-normal leading-none">
            {outcome === 'won'
              ? t('ui.areaVersus.youBeat', { name: foe.name })
              : t('ui.areaVersus.theyWon', { name: foe.name })}
          </b>
        </div>
      </div>
      <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
        {outcome === 'won' ? t('ui.areaVersus.healedAfter') : t('ui.areaVersus.lostBody')}
      </p>
      <FriendRequestButton foe={foe} signedInAs={signedInAs} />
    </div>
  )
}

/** One request on the Friends page: who, where they met your team, ACCEPT or NO. */
function RequestRow({ r }: { r: FriendRequest }) {
  const { t } = useT()
  const area = useGame((s) => (r.areaId ? s.data.areas.find((a) => a.id === r.areaId) : undefined))
  const [busy, setBusy] = useState(false)
  const maxFriends = useGame((s) => s.data.config.maxFriends ?? 100)
  const answer = (accept: boolean) => {
    setBusy(true)
    answerFriendRequest(r.id, accept)
      .then((status: AnswerStatus) => {
        if (status === 'added') pushToast(t('ui.friends.newFriend', { name: r.name }), 'good')
        else if (status === 'full') pushToast(t('ui.friends.full', { max: maxFriends }), 'bad')
        else if (status === 'friend_full') pushToast(t('ui.friends.friendFull', { name: r.name }), 'bad')
        else if (status === 'gone') pushToast(t('ui.areaVersus.requestGone'), 'info')
      })
      .catch(() => {
        setBusy(false)
        pushToast(t('ui.areaVersus.answerFailed'), 'bad')
      })
  }
  return (
    <li className="flex flex-wrap items-center gap-2.5 bg-paper py-1.5 pl-1.5 pr-2 shadow-ring-line">
      <TrainerLook src={avatarOf(r.avatar).src} w={44} h={48} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className="truncate text-[21px] font-normal leading-none">
          <TrainerName name={r.name} rich={r.rich} />
        </b>
        <small className="font-pixel-sm text-[16px] leading-tight text-muted">
          {area ? t('ui.areaVersus.metIn', { area: area.name }) : t('ui.areaVersus.metSomewhere')}
        </small>
      </span>
      <span className="flex gap-2">
        <PixelButton
          size="sm"
          disabled={busy}
          onClick={() => answer(false)}
          aria-label={t('ui.areaVersus.declineLabel', { name: r.name })}
        >
          {t('ui.areaVersus.decline')}
        </PixelButton>
        <PixelButton
          size="sm"
          variant="success"
          disabled={busy}
          onClick={() => answer(true)}
          aria-label={t('ui.areaVersus.acceptLabel', { name: r.name })}
        >
          <PixelIcon name="check" size={16} />
          {t('ui.areaVersus.accept')}
        </PixelButton>
      </span>
    </li>
  )
}

/** The Friends page's requests, at its top while there are some. */
export function FriendRequests({ requests }: { requests: FriendRequest[] }) {
  const { t } = useT()
  if (!requests.length) return null
  return (
    <section className="grid gap-2" aria-labelledby="friend-requests">
      <h2 id="friend-requests" className="m-0 flex items-center gap-2 text-2xl font-normal leading-none">
        <PixelIcon name="mail" size={22} />
        {t('ui.areaVersus.requestsTitle', { n: requests.length })}
      </h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {requests.map((r) => (
          <RequestRow key={r.id} r={r} />
        ))}
      </ul>
    </section>
  )
}
