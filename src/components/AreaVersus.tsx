// Real-player battles in areas (docs/54): the card that shows a real player's team before FIGHT or SKIP, its rules
// (once, the first time a card is turned over, and from INFO), the result card's friend request, the Friends page's
// requests, and the service that keeps a team ready for the area being played.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  areaVersusConfig,
  areaVersusHere,
  daysAgo,
  familyTalent,
  foePrize,
  progressOf,
  teamOf,
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

/** When the bands split away, and when the intro is over (ms): the full scene, or a still one when calm. */
const INTRO_MS = { full: [1450, 1700], calm: [900, 900] } as const

/** Speed lines across a band: thin bars rushing by, each on its own row and beat (`rp-streak-*`, pixel steps). */
const STREAKS = [
  { top: 8, w: 34, delay: 0 },
  { top: 19, w: 22, delay: 0.18 },
  { top: 31, w: 40, delay: 0.09 },
  { top: 44, w: 18, delay: 0.27 },
  { top: 56, w: 30, delay: 0.05 },
  { top: 69, w: 24, delay: 0.21 },
  { top: 82, w: 36, delay: 0.13 },
  { top: 93, w: 20, delay: 0.3 },
]
function Streaks({ toward }: { toward: 'left' | 'right' }) {
  return (
    <>
      {STREAKS.map((r, i) => (
        <span
          key={i}
          className={cx(
            'absolute h-[4px] bg-white/25',
            toward === 'left' ? 'rp-streak-left left-full' : 'rp-streak-right right-full',
          )}
          style={{ top: `${r.top}%`, width: `${r.w}%`, animationDelay: `${r.delay}s` }}
        />
      ))}
    </>
  )
}

/**
 * A side's team in the intro, beside its trainer (the user's ask, 2026-10-31): each Pokémon's menu icon on a plate, a
 * star on a shiny, popping in one after another from `from` seconds. Three to a column: a team of six is two columns.
 */
function IntroTeam({
  team,
  icon,
  from,
}: {
  team: readonly { dex: number; shiny?: boolean }[]
  icon: number
  from: number
}) {
  return (
    <span className="grid shrink-0 grid-flow-col grid-rows-3 items-end gap-1">
      {team.map((m, i) => (
        <span
          key={i}
          className="rp-mon relative grid place-items-center bg-night/45 p-0.5 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]"
          style={{ animationDelay: `${(from + i * 0.07).toFixed(2)}s` }}
        >
          <MiniSprite dex={m.dex} size={icon} />
          {m.shiny && <PixelIcon name="star" size={12} className="absolute right-0.5 top-0.5" />}
        </span>
      ))}
    </span>
  )
}

/**
 * The card's intro (the user's asks, 2026-10-31: "a small animated intro that indicates it is a real player battle",
 * then "it should feel awesome and stay simple"): a rival's entrance over the whole screen. Your blue band slams in from
 * the left and their red one from the right, speed lines rushing; each trainer slides in as a black silhouette and
 * lands in two white frames into colour; VS slams down on the seam (the hit: a short shake, one white flash, a boom),
 * the gold seam lights, "REAL PLAYER BATTLE!" and their name wipe in; then the bands split apart onto the card. 1.7 s
 * in pixel steps, a tap ends it. In full under Short (an encounter's intro, docs/15 §8); calm: the still scene, no
 * shake or flash; animations off: none.
 */
export function RealPlayerIntro({ foe, onDone }: { foe: AreaFoe; onDone: () => void }) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const desktop = useIsDesktop()
  const mine = useGame((s) => s.save?.player?.avatar ?? s.save?.player?.character ?? 'red')
  // Your team as it goes in: the save, then its team (a selector must not build a new array on every call).
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const myTeam = save ? teamOf(save).filter((p) => !!data.species[p.dex]) : []
  const [out, setOut] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (level === 'off') return done.current()
    if (!calm) feelSound('versus.intro')
    const [split, end] = calm ? INTRO_MS.calm : INTRO_MS.full
    const apart = setTimeout(() => setOut(true), split)
    const finish = setTimeout(() => done.current(), end)
    return () => {
      clearTimeout(apart)
      clearTimeout(finish)
    }
  }, [level, calm])
  if (level === 'off' || typeof document === 'undefined') return null
  // The trainers fill their band: a share of the screen's height on a wide one, of its width on a phone.
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth
  const vh = typeof window === 'undefined' ? 844 : window.innerHeight
  const size = Math.round(desktop ? Math.min(vh * 0.42, 320) : Math.min(vw * 0.5, vh * 0.26, 220))
  // The team icons beside them (MiniSprite draws them at 1.5× this): three stand a little over half the trainer's height.
  const icon = Math.round(size * (desktop ? 0.13 : 0.15))
  // The words' ink outline, pixel-hard on every side.
  const ink =
    '[text-shadow:3px_0_0_#24304f,-3px_0_0_#24304f,0_3px_0_#24304f,0_-3px_0_#24304f,3px_3px_0_#24304f,-3px_3px_0_#24304f,3px_-3px_0_#24304f,-3px_-3px_0_#24304f,6px_6px_0_rgba(0,0,0,0.35)]'
  return createPortal(
    <button
      type="button"
      data-testid="real-player-intro"
      onClick={() => done.current()}
      aria-label={t('ui.areaVersus.introSkip')}
      className={cx(
        'fixed inset-0 z-[110] block cursor-pointer overflow-hidden bg-night',
        out && !calm && 'rp-fade',
      )}
    >
      <span role="status" className="sr-only">
        {t('ui.areaVersus.intro', { name: foe.name })}
      </span>
      <span aria-hidden className={cx('absolute inset-0', !calm && 'rp-shake')}>
        {/* Yours: the top band, from the left. */}
        <span
          className={cx(
            'absolute inset-0 overflow-hidden bg-[#3a6fd8] [clip-path:polygon(0_0,100%_0,100%_44%,0_56%)] md:[clip-path:polygon(0_0,100%_0,100%_38%,0_62%)]',
            out && !calm ? 'rp-top-out' : 'rp-top',
          )}
        >
          <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(0,0,0,0.08)_10px_20px)]" />
          <Streaks toward="right" />
          {/* A phone stacks them (you above the seam, them below it); a wide screen sets them side by side. */}
          {/* On a wide screen the seam rises to the right of your feet: your team stands level with your head. */}
          <span className="rp-me absolute bottom-[57%] left-[4%] flex items-end gap-2 md:bottom-[38%] md:left-[10%] md:items-start">
            <TrainerSprite src={avatarOf(mine).src} size={size} />
            {/* Your team, to the right of you: it pops in once VS has landed. */}
            <IntroTeam team={myTeam} icon={icon} from={0.62} />
          </span>
        </span>
        {/* Theirs: the bottom band, from the right. */}
        <span
          className={cx(
            'absolute inset-0 overflow-hidden bg-[#e0483a] [clip-path:polygon(0_56%,100%_44%,100%_100%,0_100%)] md:[clip-path:polygon(0_62%,100%_38%,100%_100%,0_100%)]',
            out && !calm ? 'rp-bottom-out' : 'rp-bottom',
          )}
        >
          <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_10px,rgba(0,0,0,0.08)_10px_20px)]" />
          <Streaks toward="left" />
          <span className="rp-foe absolute right-[4%] top-[57%] flex items-end gap-2 md:right-[10%] md:top-[40%]">
            {/* Their team, to the left of them, a beat after yours. */}
            <IntroTeam team={foe.team} icon={icon} from={0.7} />
            <TrainerSprite src={foe.sprite ?? avatarOf(foe.avatar).src} size={size} />
          </span>
          <span
            className={cx(
              'rp-name absolute bottom-[7%] right-[6%] max-w-[80%] truncate text-right text-[34px] leading-none text-white md:right-[12%] md:text-[48px]',
              ink,
            )}
          >
            {foe.name}
          </span>
        </span>
        {/* The seam lights gold as VS lands. */}
        <span
          className={cx(
            'absolute inset-0 bg-gold [clip-path:polygon(0_54.8%,100%_42.8%,100%_45.2%,0_57.2%)] md:[clip-path:polygon(0_60.6%,100%_36.6%,100%_39.4%,0_63.4%)]',
            // Its animation holds it lit: the split takes the class away, or the seam would stay over the card.
            out && !calm ? 'opacity-0' : calm ? '' : 'rp-seam',
          )}
        />
        <span
          className={cx(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            out && !calm && 'opacity-0',
          )}
        >
          <span className="rp-vs block">
            <span className={cx('rp-vs-beat block text-[96px] leading-none text-gold md:text-[150px]', ink)}>
              VS
            </span>
          </span>
        </span>
        <span
          className={cx(
            'rp-ribbon absolute inset-x-0 top-[9%] flex justify-center',
            out && !calm && 'opacity-0',
          )}
        >
          <span
            className={cx(
              'bg-night/85 px-4 py-1.5 text-[26px] leading-none tracking-[0.1em] text-gold md:text-[40px]',
              ink,
            )}
          >
            {t('ui.areaVersus.introTitle')}
          </span>
        </span>
        {!calm && <span className="rp-flash absolute inset-0 bg-white opacity-0" />}
      </span>
    </button>,
    document.body,
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
    <div className="flex flex-col gap-2.5">
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

/**
 * SEND FRIEND REQUEST's letter (the user's ask, 2026-10-31: "an envelope with a heart, it comes from the button and
 * flies away"): an envelope sealed with a heart pops out of the button's middle (`x`, `y`, the screen's), wobbles up
 * and away to the right and fades, little hearts puffing behind it. 0.9 s in pixel steps, a soft chirp; the OS's
 * reduced motion leaves it on its last frame (gone), animations off: none.
 */
export function LetterFlight({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const { level } = useMotion()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (level === 'off') return done.current()
    feelSound('friend.send')
    const timer = setTimeout(() => done.current(), 1000)
    return () => clearTimeout(timer)
  }, [level])
  if (level === 'off' || typeof document === 'undefined') return null
  return createPortal(
    <span
      aria-hidden
      data-testid="letter-flight"
      className="pointer-events-none fixed z-[130]"
      style={{ left: x, top: y }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="rp-puff absolute"
          style={{ left: -26 + i * 18, top: -10, animationDelay: `${0.12 + i * 0.1}s` }}
        >
          <PixelIcon name="heart" size={16} />
        </span>
      ))}
      <span className="rp-letter absolute -left-6 -top-6 block">
        <span className="relative block">
          <PixelIcon name="mail" size={48} />
          <span className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2">
            <PixelIcon name="heart" size={18} />
          </span>
        </span>
      </span>
    </span>,
    document.body,
  )
}

/** SEND FRIEND REQUEST, and what became of it. Nothing for a friend already, or signed out (who would it be from?). */
export function FriendRequestButton({ foe, signedInAs }: { foe: AreaFoe; signedInAs?: boolean }) {
  const { t } = useT()
  const areaId = useGame((s) => s.run.areaId)
  const signedIn = useGame((s) => s.auth.status === 'signed_in') || !!signedInAs
  const sent = useAreaVersus((s) => s.sent[foe.id])
  const maxFriends = useGame((s) => s.data.config.maxFriends ?? 100)
  // The letter in flight: it outlives the button (which gives way to "Request sent" at once).
  const [flight, setFlight] = useState<{ x: number; y: number; n: number } | null>(null)
  const letter = flight && (
    <LetterFlight key={flight.n} x={flight.x} y={flight.y} onDone={() => setFlight(null)} />
  )
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
      <>
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
        {letter}
      </>
    )
  }
  return (
    <div className="grid gap-1">
      <PixelButton
        className="w-full"
        disabled={sent === 'sending'}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setFlight({ x: r.left + r.width / 2, y: r.top + r.height / 2, n: Date.now() })
          void sendFriendRequest(foe, areaId)
        }}
      >
        <PixelIcon name="friends" size={20} />
        {t('ui.areaVersus.sendRequest')}
      </PixelButton>
      {sent === 'error' && (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-danger" role="alert">
          {t('ui.areaVersus.requestFailed')}
        </p>
      )}
      {letter}
    </div>
  )
}

/** The result card's real-player part (docs/54): who won, the heal, the friend request. */
export function DuelResult({
  outcome,
  foe,
  signedInAs,
  follow,
}: {
  outcome: 'won' | 'lost'
  foe: AreaFoe
  signedInAs?: boolean
  /**
   * Scroll it into view as it shows (the battle's result card, the user's ask: SEND FRIEND REQUEST clearly seen), clear
   * of the buttons pinned at the card's foot.
   */
  follow?: boolean
}) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!follow) return
    // A beat for the card's last pieces to settle, then the whole block in view.
    const timer = setTimeout(
      () =>
        box.current?.scrollIntoView({
          block: 'nearest',
          behavior: level === 'off' || calm ? 'auto' : 'smooth',
        }),
      120,
    )
    return () => clearTimeout(timer)
  }, [follow, level, calm])
  return (
    <div ref={box} className="flex scroll-mb-[160px] flex-col gap-2 bg-paper p-2.5 shadow-ring">
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
