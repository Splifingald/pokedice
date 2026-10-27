import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  comingUp,
  regionOf,
  regionOfArea,
  dayCareLevelProgress,
  dayCareOf,
  isDayCareOpen,
  nextCheckProgress,
  teamOf,
  versusLeagueFor,
  versusUnlocked,
  VERSUS_TEAM_SIZE,
  type Area,
  type ComingUp,
  type ConditionStatus,
} from '@/engine'
import { useT } from '@/i18n/react'
import { conditionLabel, waitText } from '@/i18n/text'
import { Chip, NewTag } from '@/components/Chip'
import { EggSprite } from '@/components/EggSprite'
import { PixelIcon } from '@/components/icons'
import { MINI_SCALE, MiniSprite } from '@/components/SpriteImg'
import { isSupabaseConfigured } from '@/lib/supabase'
import { rememberedVersus, versusBoardCached, type VersusEntry } from '@/lib/versus'
import { leagueHomeCached, type LeagueHome } from '@/lib/versusLeague'
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { areaStatus } from './areas'
import { AreaStrip } from '@/components/AreaStrip'
import { dayCarePicture } from '@/fx/areaArt'
import { travelTo } from '@/store/travel'
import { EventWidgets } from '@/screens/events/EventWidgets'
import { useInWorld, WorldWidgets } from '@/screens/events/world'
import { levelText, useLevelSpan } from './AreaPlate'
import { CARD_STRIP_H, HomeCard, Meter } from './Widget'

/** A secret area open in the region: its strip, its name, its levels and where it stands. One tap travels there. */
function SecretCard({ area }: { area: Area }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const span = useLevelSpan(area)
  const status = areaStatus(save, data, area)
  const here = status === 'here'
  return (
    <HomeCard
      picture={
        <AreaStrip area={area} h={CARD_STRIP_H} className="absolute inset-0 h-full w-full object-cover" />
      }
      name={area.name}
      tag={status === 'new' ? <NewTag /> : here ? <Chip tone="red">{t('ui.home.here')}</Chip> : undefined}
      status={`${levelText(span)} · ${t(`ui.home.stTitle.${status}`)}`}
      label={t(status === 'new' ? 'ui.home.secretNewLabel' : 'ui.home.secretOpenLabel', { area: area.name })}
      onClick={() => !here && travelTo(area)}
    />
  )
}

/**
 * Every secret area open in this region (docs/42: Home lists them under their own heading): the newest first, a NEW tag
 * on one never played, one tap to travel there. Still-closed ones stay a surprise.
 */
function SecretAreaWidgets() {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const open = data.areas
    .filter((a) => a.hidden && regionOfArea(a) === regionOf(save))
    .map((a) => ({ area: a, status: areaStatus(save, data, a) }))
    .filter((x) => x.status !== 'locked')
    .sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new'))
  return open.map(({ area }) => <SecretCard key={area.id} area={area} />)
}

/**
 * A heading and its cards, one under the other (two side by side where the column is wide); the whole section goes
 * when nothing in it is showing.
 */
function HomeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 [&:not(:has(>div>*))]:hidden" aria-label={title}>
      <h2 className="m-0 text-[24px] font-normal leading-none">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-2">{children}</div>
    </section>
  )
}

/** The Day Care's picture: its yard's picture (its drawn scene until the picture loads). */
const DAY_CARE_SCENE = { id: 'daycare', bannerUrl: 'daycare.png' }
/** The yard, cut so the cottage and the fence the Pokémon stand in front of show (a strip centres on its horizon). */
function yardPicture() {
  const p = dayCarePicture()
  return p && { ...p, id: 'daycare-card', horizon: Math.round(60 + CARD_STRIP_H * 0.55) }
}
const Yard = () => (
  <AreaStrip
    area={DAY_CARE_SCENE}
    picture={yardPicture()}
    h={CARD_STRIP_H}
    className="absolute inset-0 h-full w-full object-cover"
  />
)

/**
 * The Day Care, one for every region: its yard with your two standing in it, what's next (the next Egg check, or
 * waiting for a pair) and its gauge; with an Egg waiting, gold, the Egg shaking in the yard. It only ever opens the Day
 * Care page (with an Egg, straight into the hatching). No card until it opens.
 */
function DayCareWidget() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const now = useNow(30_000)
  const cfg = data.config.dayCare
  if (!isDayCareOpen(save, data)) return null
  const dc = dayCareOf(save)
  if (dc.egg)
    return (
      <HomeCard
        tone="gold"
        picture={
          <>
            <Yard />
            <span className="absolute inset-0 grid place-items-center">
              <EggSprite size={36} shake />
            </span>
          </>
        }
        name={t('ui.home.dayCare')}
        tag={<Chip tone="gold">{t('ui.home.eggTag')}</Chip>}
        status={<span className="text-ink">{t('ui.home.dcTapHatch')}</span>}
        label={t('ui.home.dcEggLabel')}
        onClick={() => navigate('/daycare', { state: { hatch: true } })}
      />
    )
  const rows = dc.residents.map((r) => ({
    r,
    p: dayCareLevelProgress(r, now, data),
    name: data.species[r.inst.dex]?.name ?? t('ui.common.pokemon'),
  }))
  const free = Math.max(0, cfg.slots - rows.length)
  const friends = dc.guests.length
  // No pair, no clock: the gauge stays away until two here can make an Egg.
  const check = nextCheckProgress(save, data, now)
  const next = check ? t('ui.home.dcNextCheck', { time: waitText(check.at - now) }) : t('ui.home.dcNoPair')
  const words = [
    ...rows.map((x) =>
      t('ui.home.dcMon', { name: x.name, level: t('ui.common.level.short', { n: x.p.level }) }),
    ),
    ...Array.from({ length: free }, () => t('ui.home.dcFree')),
    ...(friends ? [tPlural('ui.home.dcFriends', friends, { n: friends })] : []),
    next,
  ].join('. ')
  // What they gained there: the one number a player checks the Day Care for, as a chip by the name.
  const gained = rows.map((x) =>
    x.p.level >= data.config.maxLevel
      ? t('ui.mon.xpMax')
      : t('ui.dayCare.gainedLv', { n: x.p.level - x.r.inst.level }),
  )
  return (
    <HomeCard
      picture={
        <>
          <Yard />
          {/* Your two in front of the fence. */}
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1" aria-hidden>
            {rows.map((x) => (
              <MiniSprite key={x.r.inst.id} dex={x.r.inst.dex} size={36} className="translate-y-[14%]" />
            ))}
          </span>
        </>
      }
      name={t('ui.home.dayCare')}
      tag={gained.length > 0 ? <Chip tone="done">{gained.join(' · ')}</Chip> : undefined}
      status={next}
      meter={check && <Meter value={check.done} max={1} />}
      label={t('ui.home.dayCareLabel', { state: words })}
      onClick={() => navigate('/daycare')}
    />
  )
}

/**
 * The Versus card's picture (public/backgrounds/versus.png, 478 × 265, from the Visual Lab's prompt): a stadium at
 * night, red against blue; framed on the crowd and the centre circle (VS_FOCUS is its object-position).
 */
const VS_BANNER = '/backgrounds/versus.png'
const VS_FOCUS = '50% 75%'

/** The tightest a team gets before its icons shrink: a step of 60 % of an icon's box (the art has room around it). */
const FAN_MIN_STEP = 0.6

/**
 * A team spread over the room it is given, so it never runs under what sits beside it (the VS). Each Pokémon is `step`
 * px to the right of the one before when there is room; on a narrow picture the steps shrink, down to FAN_MIN_STEP of
 * an icon, and only then do the icons get smaller.
 */
function TeamFan({
  dexes,
  size,
  step,
  className,
}: {
  dexes: number[]
  size: number
  step: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState(size)
  const n = dexes.length
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const room = el.clientWidth
      if (!room || n < 2) return setFit(size)
      // The biggest icon whose team still fits at the tightest step.
      const box = Math.min(size * MINI_SCALE, room / (1 + FAN_MIN_STEP * (n - 1)))
      setFit(Math.max(16, Math.floor(box / MINI_SCALE)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [n, size])
  return (
    <span ref={ref} className="flex h-full w-full min-w-0 items-center" aria-hidden>
      {dexes.map((dex, i) =>
        i < n - 1 ? (
          // A slot that can shrink: its icon keeps its size and spills over the next one.
          <span key={i} className="flex min-w-0" style={{ flex: `0 1 ${Math.round((step * fit) / size)}px` }}>
            <MiniSprite dex={dex} size={fit} className={className} />
          </span>
        ) : (
          <MiniSprite key={i} dex={dex} size={fit} className={className} />
        ),
      )}
    </span>
  )
}

/** Versus, once open: set a team, then teams to beat and defense wins. No card before. */
function VersusWidget() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const userId = useGame((s) => s.auth.userId)
  const open = versusUnlocked(save, data)
  const league = versusLeagueFor(save, data)
  const [board, setBoard] = useState<VersusEntry[] | null>(null)
  // The weekly league (docs/44): your trophies and place, in place of the wins.
  const [home, setHome] = useState<LeagueHome | null>(null)
  useEffect(() => {
    if (!open || !signedIn || !isSupabaseConfigured) return
    let live = true
    versusBoardCached()
      .then((rows) => live && setBoard(rows))
      .catch(() => live && setBoard(null))
    if (league)
      leagueHomeCached()
        .then((h) => live && setHome(h))
        .catch(() => live && setHome(null))
    return () => {
      live = false
    }
  }, [open, signedIn, league])

  if (!open) return null
  // The board decides once it has answered; until then (or when it can't be reached) your row as it last gave it, so
  // the card never shows the party in place of a Versus team that is set.
  const me = board ? board.find((r) => r.isMe) : rememberedVersus(userId)
  const set = !!me?.team.length
  // The team on the board (the three chosen for Versus), or the party until one is set.
  const shown = set ? me!.team : teamOf(save).map((p) => ({ dex: p.dex, level: p.level, shiny: p.shiny }))
  return (
    <HomeCard
      picture={
        <>
          <img
            src={VS_BANNER}
            alt=""
            className="pixelated absolute inset-0 h-full w-full object-cover"
            style={{ imageRendering: 'pixelated', objectPosition: VS_FOCUS }}
          />
          <span className="absolute inset-y-0 left-1 right-8 flex items-center">
            <TeamFan dexes={shown.slice(0, VERSUS_TEAM_SIZE).map((m) => m.dex)} size={32} step={40} />
          </span>
          <span
            className="absolute inset-y-0 right-1 flex items-center text-[30px] leading-none text-gold [text-shadow:0_3px_0_#c4382a,3px_0_0_#c4382a,-2px_0_0_#24304f,0_-2px_0_#24304f]"
            aria-hidden
          >
            VS
          </span>
        </>
      }
      name={t('ui.versus.title')}
      tag={!set ? <NewTag /> : undefined}
      status={
        set && league && home ? (
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={t('ui.league.trophiesLabel', { n: home.trophies })}
          >
            {home.trophies}
            <PixelIcon name="trophy" size={16} />
            {home.joined && (
              <span className="text-muted">
                {t('ui.league.rankShort', { rank: home.rows.find((r) => r.isMe)?.rank ?? 1 })}
              </span>
            )}
          </span>
        ) : set ? (
          // Attack wins (sword) / defense wins (shield).
          <span
            className="inline-flex items-center gap-1.5"
            aria-label={`${tPlural('ui.versus.wins', me!.attackWins)} · ${tPlural('ui.versus.defenseWins', me!.defenseWins)}`}
          >
            {me!.attackWins}
            <PixelIcon name="sword" size={16} />
            <span>/</span>
            {me!.defenseWins}
            <PixelIcon name="shield" size={16} />
          </span>
        ) : (
          t('ui.home.vsOpen')
        )
      }
      label={
        set && league && home
          ? t('ui.league.trophiesLabel', { n: home.trophies })
          : set
            ? t('ui.home.vsSetLabel', { wins: me!.defenseWins, n: me!.attackWins })
            : t('ui.home.vsOpenLabel')
      }
      onClick={() => navigate('/versus')}
    />
  )
}

/**
 * "Coming up: Day Care · 7/20 caught": the next thing to open and how close it is, from the engine's numbers
 * (comingUp). One line instead of a locked square each.
 */
export function ComingUpView({ next }: { next: ComingUp }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  /** A secret area's condition still to meet, counted: "Best Lv. 5/70", "22/133 in Pokédex", or its own words. */
  const secretGoal = (st: ConditionStatus) => {
    const vars = { current: Math.min(st.current, st.target), target: st.target }
    if (st.cond.kind === 'pokedex') return t('ui.home.secretDex', vars)
    if (st.cond.kind === 'maxLevel') return t('ui.home.secretLevel', vars)
    const label = conditionLabel(st.cond, data)
    // An area to reach or to clear is said in words: it has no count.
    return st.cond.kind === 'area' || st.cond.kind === 'cleared'
      ? label
      : `${label} · ${vars.current}/${vars.target}`
  }
  const what =
    next.kind === 'dayCare'
      ? `${t('ui.home.dayCare')} · ${t('ui.home.dcCaught', { n: next.current, max: next.target })}`
      : next.kind === 'versus'
        ? `${t('ui.versus.title')} · ${t('ui.versus.lockedCount', { n: next.current })}`
        : next.kind === 'events'
          ? `${t('ui.home.events')} · ${t('ui.map.clearFirst', { area: data.areas.find((a) => a.id === next.areaId)?.name ?? '' })}`
          : `${next.area.name} · ${secretGoal(next.status)}`
  return (
    <p className="m-0 flex min-w-0 items-center gap-2 bg-well px-2.5 py-2 font-pixel-sm text-[16px] leading-tight text-muted shadow-ring-line">
      <PixelIcon name="lock" size={16} className="shrink-0" />
      <span className="min-w-0">{t('ui.home.comingUp', { what })}</span>
    </p>
  )
}

/** The line under Home's cards, while something is still to open. */
export function ComingUpLine() {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const next = comingUp(save, data)
  return next && <ComingUpView next={next} />
}

/**
 * Home's sections (docs/43 §5.2): what's on now, the secret areas found, then the features, each a list of the one card
 * (`HomeCard`); a heading only once something is under it; then the "Coming up" line. Inside a small world, only the world's: its mythical and
 * its secret areas (the main game's wait outside, docs/21).
 */
export function Widgets() {
  const { t } = useT()
  const inside = useInWorld().inside
  if (inside)
    return (
      <div className="flex flex-col gap-2">
        <WorldWidgets />
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <HomeSection title={t('ui.home.sectionEvents')}>
        <EventWidgets />
      </HomeSection>
      <HomeSection title={t('ui.home.sectionSecrets')}>
        <SecretAreaWidgets />
      </HomeSection>
      <HomeSection title={t('ui.home.sectionFeatures')}>
        <DayCareWidget />
        <VersusWidget />
      </HomeSection>
      {/* The next thing to open and how close it is: a goal, never a locked card. */}
      <ComingUpLine />
    </div>
  )
}
