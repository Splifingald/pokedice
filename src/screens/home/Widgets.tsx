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
  versusUnlocked,
  VERSUS_TEAM_SIZE,
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
import { useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { areaStatus } from './areas'
import { AreaStrip } from '@/components/AreaStrip'
import { dayCarePicture } from '@/fx/areaArt'
import { travelTo } from '@/store/travel'
import { EventWidgets } from '@/screens/events/EventWidgets'
import { useInWorld, WorldWidgets } from '@/screens/events/world'
import { HeadTag, Meter, Widget, WidgetBanner, WIDGET_BANNER_H, WidgetRows as DayCareRows } from './Widget'

/**
 * Every secret area open in this region (docs/42: Home lists them under their own heading): the newest first, a NEW tag
 * on one never played, one tap to travel there. Still-closed ones stay a surprise.
 */
function SecretAreaWidgets() {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const open = data.areas
    .filter((a) => a.hidden && regionOfArea(a) === regionOf(save))
    .map((a) => ({ area: a, status: areaStatus(save, data, a) }))
    .filter((x) => x.status !== 'locked')
    .sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new'))
  return open.map(({ area, status }) => {
    const cond = area.unlockConditions?.[0]
    const here = status === 'here'
    return (
      <Widget
        key={area.id}
        title={t('ui.home.secretArea')}
        tag={status === 'new' ? <NewTag /> : here ? <Chip tone="gold">{t('ui.home.here')}</Chip> : undefined}
        label={t(status === 'new' ? 'ui.home.secretNewLabel' : 'ui.home.secretOpenLabel', { area: area.name })}
        onClick={() => !here && travelTo(area)}
      >
        <WidgetBanner>
          <AreaStrip area={area} h={BANNER.h} className="absolute inset-0 h-full w-full" />
        </WidgetBanner>
        <DayCareRows
          top={<span className="truncate text-[20px] leading-none">{area.name}</span>}
          bottom={cond ? conditionLabel(cond, data) : ''}
        />
      </Widget>
    )
  })
}

/** A heading and its widgets two by two; the whole section goes when nothing in it is showing. */
function HomeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 [&:not(:has(>div>*))]:hidden" aria-label={title}>
      <h2 className="m-0 text-[24px] font-normal leading-none">{title}</h2>
      <div className="grid grid-cols-2 content-start gap-2.5">{children}</div>
    </section>
  )
}

/** The Day Care's banner: a strip of its yard's picture (its drawn scene until the picture loads). */
const DAY_CARE_SCENE = { id: 'daycare', bannerUrl: 'daycare.png' }
/** The strip, in scene pixels: rows 60 to 152, the cottage down to the fence the Pokémon stand in front of. */
const BANNER = { h: WIDGET_BANNER_H, top: 60 }
/** The yard's picture, its strip cut at BANNER.top (a strip centres on the horizon: stripTop in fx/areaArt). */
function bannerPicture() {
  const p = dayCarePicture()
  return p && { ...p, id: 'daycare-banner', horizon: Math.round(BANNER.top + BANNER.h * 0.55) }
}

/** An element's height in CSS pixels, kept up to date (0 until measured). */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [h, setH] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setH(el.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => setH(es[0]?.contentRect.height ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, h] as const
}

/**
 * The banner keeps its shape whether its picture has loaded or not, so the widget never changes size. `children` sit
 * on it, given its height (the Pokémon are drawn to it).
 */
function DayCareBanner({ children }: { children?: (height: number) => ReactNode }) {
  const [ref, height] = useHeight<HTMLSpanElement>()
  return (
    <span
      ref={ref}
      className="relative block w-full overflow-hidden shadow-halo"
      style={{ aspectRatio: `288 / ${BANNER.h}` }}
    >
      <AreaStrip
        area={DAY_CARE_SCENE}
        picture={bannerPicture()}
        h={BANNER.h}
        className="absolute inset-0 h-full w-full"
      />
      {children && <span className="absolute inset-0 leading-none">{children(height)}</span>}
    </span>
  )
}

/** Something centred on the banner: the lock, the Egg. */
const OnBanner = ({ children }: { children: ReactNode }) => <span className="grid h-full place-items-center">{children}</span>

/**
 * The Day Care, one for every region: its banner, with your two standing on it and the levels they gained there under
 * them (MAX at the level cap), the gauge to the next Egg check and its time (no gauge while no pair is there: nothing
 * is checked); or, with an Egg waiting, gold with the Egg shaking on the banner. The same size in every state. It only
 * ever opens the Day Care page (with an Egg, straight into the hatching). No square until it opens: the "Coming up"
 * line counts the catches to go.
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
      <Widget
        title={t('ui.home.dayCare')}
        tag={
          <HeadTag>
            <Chip tone="gold">{t('ui.home.eggTag')}</Chip>
          </HeadTag>
        }
        label={t('ui.home.dcEggLabel')}
        onClick={() => navigate('/daycare', { state: { hatch: true } })}
        className="panel-gold"
      >
        <DayCareBanner>
          {(h) => (
            <OnBanner>
              <EggSprite size={Math.max(20, Math.round(h * 0.42))} shake />
            </OnBanner>
          )}
        </DayCareBanner>
        <DayCareRows
          top={<span className="truncate text-[20px] leading-none">{t('ui.dayCare.eggWaiting')}</span>}
          bottom={<span className="text-ink">{t('ui.home.dcTapHatch')}</span>}
        />
      </Widget>
    )
  const slots = Array.from({ length: Math.max(cfg.slots, dc.residents.length) }, (_, i) => dc.residents[i])
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
    ...rows.map((x) => t('ui.home.dcMon', { name: x.name, level: t('ui.common.level.short', { n: x.p.level }) })),
    ...Array.from({ length: free }, () => t('ui.home.dcFree')),
    ...(friends ? [tPlural('ui.home.dcFriends', friends, { n: friends })] : []),
    next,
  ].join('. ')
  const cols = { gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }
  return (
    <Widget
      title={t('ui.home.dayCare')}
      tag={<HeadTag />}
      label={t('ui.home.dayCareLabel', { state: words })}
      onClick={() => navigate('/daycare')}
    >
      <DayCareBanner>
        {(h) => (
          // Your two stand in front of the fence, as tall as the banner; a free slot is a dashed space.
          <span className="grid h-full items-end" style={cols} aria-hidden>
            {slots.map((r, i) =>
              r ? (
                <span key={r.inst.id} className="grid justify-items-center">
                  {/* MiniSprite's box is 1.5× the size asked; its icon fills the lower part, so it may bleed a little. */}
                  <MiniSprite dex={r.inst.dex} size={Math.max(24, Math.round((h * 1.05) / 1.5))} className="translate-y-[12%]" />
                </span>
              ) : (
                <span key={`free-${i}`} className="grid justify-items-center pb-[8%]">
                  <span
                    className="bg-paper/40 outline-dashed outline-2 -outline-offset-2 outline-paper"
                    style={{ width: Math.round(h * 0.5), height: Math.round(h * 0.42) }}
                  />
                </span>
              ),
            )}
          </span>
        )}
      </DayCareBanner>
      <DayCareRows
        top={
          <span className="grid w-full" style={cols} aria-hidden>
            {slots.map((r, i) => {
              if (!r)
                return (
                  <span key={`free-${i}`} className="truncate text-center font-pixel-sm text-[16px] leading-none text-muted">
                    {t('ui.home.freeSlot')}
                  </span>
                )
              const level = dayCareLevelProgress(r, now, data).level
              return (
                <span key={r.inst.id} className="grid justify-items-center">
                  {level >= data.config.maxLevel ? (
                    <Chip tone="gold">{t('ui.mon.xpMax')}</Chip>
                  ) : (
                    <Chip tone="done">{t('ui.dayCare.gainedLv', { n: level - r.inst.level })}</Chip>
                  )}
                </span>
              )
            })}
          </span>
        }
        meter={check && <Meter value={check.done} max={1} />}
        bottom={next}
      />
    </Widget>
  )
}

/**
 * The Versus widget's banner (public/backgrounds/versus.png, 478 × 265, from the Visual Lab's prompt): a stadium at
 * night, red against blue; framed on the crowd and the centre circle (VS_FOCUS is its object-position).
 */
const VS_BANNER = '/backgrounds/versus.png'
const VS_FOCUS = '50% 75%'

/** The tightest a team gets before its icons shrink: a step of 60 % of an icon's box (the art has room around it). */
const FAN_MIN_STEP = 0.6

/**
 * A team spread over the room it is given, so it never runs under what sits beside it (the VS, the lock). Each
 * Pokémon is `step` px to the right of the one before when there is room; on a narrow widget (a phone's half width)
 * the steps shrink, down to FAN_MIN_STEP of an icon, and only then do the icons get smaller.
 */
function TeamFan({ dexes, size, step, className }: { dexes: number[]; size: number; step: number; className?: string }) {
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

/** Versus, once open: set a team, then teams to beat and defense wins. No square before: the "Coming up" line counts. */
function VersusWidget() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const userId = useGame((s) => s.auth.userId)
  const open = versusUnlocked(save, data)
  const [board, setBoard] = useState<VersusEntry[] | null>(null)
  useEffect(() => {
    if (!open || !signedIn || !isSupabaseConfigured) return
    let live = true
    versusBoardCached()
      .then((rows) => live && setBoard(rows))
      .catch(() => live && setBoard(null))
    return () => {
      live = false
    }
  }, [open, signedIn])

  if (!open) return null
  // The board decides once it has answered; until then (or when it can't be reached) your row as it last gave it, so
  // the widget never shows the party in place of a Versus team that is set.
  const me = board ? board.find((r) => r.isMe) : rememberedVersus(userId)
  const set = !!me?.team.length
  // The team on the board (the three chosen for Versus), or the party until one is set.
  const shown = set ? me!.team : teamOf(save).map((p) => ({ dex: p.dex, level: p.level, shiny: p.shiny }))
  return (
    <Widget
      title={t('ui.versus.title')}
      tag={<HeadTag>{!set && <NewTag />}</HeadTag>}
      label={set ? t('ui.home.vsSetLabel', { wins: me!.defenseWins, n: me!.attackWins }) : t('ui.home.vsOpenLabel')}
      onClick={() => navigate('/versus')}
    >
      {/* A stadium as the banner: the team from the left, spaced out, and a bold VS, both centred in its height. */}
      <WidgetBanner>
        <img
          src={VS_BANNER}
          alt=""
          className="pixelated absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated', objectPosition: VS_FOCUS }}
        />
        {/* The team up to the VS: spaced out when there's room, closer together on a phone. */}
        <span className="absolute inset-y-0 left-0 right-12 flex items-center">
          <TeamFan dexes={shown.slice(0, VERSUS_TEAM_SIZE).map((m) => m.dex)} size={44} step={58} />
        </span>
        <span
          className="absolute inset-y-0 right-2 flex items-center text-[48px] leading-none text-gold [text-shadow:0_4px_0_#c4382a,4px_0_0_#c4382a,-2px_0_0_#24304f,0_-2px_0_#24304f]"
          aria-hidden
        >
          VS
        </span>
      </WidgetBanner>
      <DayCareRows
        top={
          set ? (
            // Attack wins (sword) / defense wins (shield).
            <span
              className="inline-flex items-center gap-1.5 text-[20px] leading-none"
              aria-label={`${tPlural('ui.versus.wins', me!.attackWins)} · ${tPlural('ui.versus.defenseWins', me!.defenseWins)}`}
            >
              {me!.attackWins}
              <PixelIcon name="sword" size={16} />
              <span className="text-muted">/</span>
              {me!.defenseWins}
              <PixelIcon name="shield" size={16} />
            </span>
          ) : (
            <span className="truncate text-[20px] leading-none">{t('ui.home.vsOpen')}</span>
          )
        }
        bottom={t('ui.versus.tabFight')}
      />
    </Widget>
  )
}

/**
 * "Coming up: Day Care · 7/20 caught": the next thing to open and how close it is, from the engine's numbers
 * (comingUp). One line instead of a locked square each, which a new game was mostly made of.
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
    return st.cond.kind === 'area' || st.cond.kind === 'cleared' ? label : `${label} · ${vars.current}/${vars.target}`
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

/** The line under Home's squares, while something is still to open. */
export function ComingUpLine() {
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const next = comingUp(save, data)
  return next && <ComingUpView next={next} />
}

/**
 * Home's widgets, two by two: one square for each thing that's open (a secret area to travel to, the Day Care, Versus,
 * each special event), then one line for the next thing to open (docs/15 §12). Inside a small world, only the world's:
 * its mythical and its Mart (the main game's wait outside, docs/21).
 */
export function Widgets() {
  const { t } = useT()
  const inside = useInWorld().inside
  if (inside)
    return (
      <div className="grid grid-cols-2 content-start gap-2.5">
        <WorldWidgets />
      </div>
    )
  // Under the team (docs/42): what's on now, the secret areas found, then the features; each heading only once
  // something is under it. No "Coming up" line: a thing shows here once it's open.
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
    </div>
  )
}
