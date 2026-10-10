import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dayCareLevelProgress,
  dayCareOf,
  isDayCareOpen,
  nextCheckProgress,
  speciesCaughtEverywhere,
  teamOf,
  versusReadyCount,
  versusUnlocked,
  VERSUS_TEAM_SIZE,
} from '@/engine'
import { useT } from '@/i18n/react'
import { conditionLabel, waitText } from '@/i18n/text'
import { Chip, NewTag } from '@/components/Chip'
import { EggSprite } from '@/components/EggSprite'
import { PixelIcon } from '@/components/icons'
import { MiniSprite } from '@/components/SpriteImg'
import { isSupabaseConfigured } from '@/lib/supabase'
import { versusBoardCached, type VersusEntry } from '@/lib/versus'
import { pushToast, useGame } from '@/store/game'
import { useNow } from '@/store/hooks'
import { cx } from '@/theme/util'
import { featuredSecret } from './areas'
import { AreaStrip } from '@/components/AreaStrip'
import { dayCarePicture } from '@/fx/areaArt'
import { travelTo } from '@/store/travel'
import { EventWidgets } from '@/screens/events/EventWidgets'
import { Widget } from './Widget'

/** A thin progress meter: gold, green when full. */
function Meter({ value, max }: { value: number; max: number }) {
  const k = max > 0 ? Math.min(1, value / max) : 0
  return (
    <span className="relative block h-1.5 w-full bg-line shadow-ring-line-thin" aria-hidden>
      <i
        className={cx('absolute inset-y-0 left-0 block', k >= 1 ? 'bg-hp-green' : 'bg-gold')}
        style={{ width: `${k * 100}%` }}
      />
    </span>
  )
}

/** The newest secret area (one tap to travel), or the next one to open with how close it is. */
function SecretWidget({ onSecrets }: { onSecrets: () => void }) {
  const { t } = useT()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const f = featuredSecret(save, data)
  if (!f)
    return (
      <Widget title={t('ui.map.secretAreas')} label={t('ui.home.secretsAllLabel')} onClick={onSecrets}>
        <span className="text-[20px] leading-none">{t('ui.home.secretsAll')}</span>
      </Widget>
    )
  const cond = f.area.unlockConditions?.[0]
  if (f.fresh)
    return (
      <Widget
        title={t('ui.home.secretArea')}
        tag={<NewTag />}
        label={t('ui.home.secretNewLabel', { area: f.area.name })}
        onClick={() => travelTo(f.area)}
      >
        <WidgetBanner>
          <AreaStrip area={f.area} h={BANNER.h} className="absolute inset-0 h-full w-full" />
        </WidgetBanner>
        <DayCareRows
          top={<span className="truncate text-[20px] leading-none">{f.area.name}</span>}
          bottom={cond ? conditionLabel(cond, data) : ''}
        />
      </Widget>
    )
  const label = cond ? conditionLabel(cond, data) : ''
  return (
    <Widget
      title={t('ui.home.nextSecret')}
      label={t('ui.home.secretNextLabel', {
        area: f.area.name,
        what: label,
        current: f.current,
        target: f.target,
      })}
      onClick={onSecrets}
    >
      <WidgetBanner>
        <AreaStrip area={f.area} h={BANNER.h} className="absolute inset-0 h-full w-full grayscale-[0.7]" />
        <PixelIcon
          name="lock"
          size={16}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
      </WidgetBanner>
      <DayCareRows
        top={<span className="truncate text-[20px] leading-none">{f.area.name}</span>}
        meter={<Meter value={f.current} max={f.target} />}
        bottom={
      // What the numbers count, said: "22/133 in Pokédex" with its icon, not a bare fraction.
      <span className="flex min-w-0 items-center gap-1">
        {cond?.kind === 'pokedex' ? (
          <PixelIcon name="navDex" size={16} />
        ) : cond?.kind === 'maxLevel' ? (
          <PixelIcon name="up" size={14} />
        ) : null}
        <span className="truncate">
          {cond?.kind === 'pokedex'
            ? t('ui.home.secretDex', { current: Math.min(f.current, f.target), target: f.target })
            : cond?.kind === 'maxLevel'
              ? t('ui.home.secretLevel', { current: Math.min(f.current, f.target), target: f.target })
              : label || `${Math.min(f.current, f.target)}/${f.target}`}
        </span>
      </span>
        }
      />
    </Widget>
  )
}

/** The Day Care's banner: a strip of its yard's picture (its drawn scene until the picture loads). */
const DAY_CARE_SCENE = { id: 'daycare', bannerUrl: 'daycare.png' }
/** The strip, in scene pixels: rows 60 to 152, the cottage down to the fence the Pokémon stand in front of. */
const BANNER = { h: 92, top: 60 }
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
function DayCareBanner({ dim, children }: { dim?: boolean; children?: (height: number) => ReactNode }) {
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
        className={cx('absolute inset-0 h-full w-full', dim && 'grayscale-[0.7]')}
      />
      {children && <span className="absolute inset-0 leading-none">{children(height)}</span>}
    </span>
  )
}

/** Every widget's banner: the Day Care's shape (288 × BANNER.h), whatever it shows, so the widgets line up. */
function WidgetBanner({ children }: { children: ReactNode }) {
  return (
    <span
      className="relative block w-full overflow-hidden leading-[0] shadow-halo"
      style={{ aspectRatio: `288 / ${BANNER.h}` }}
    >
      {children}
    </span>
  )
}

/** Every state's header holds the same height, a tag or not: the widget never grows by the tag's few pixels. */
const HeadTag = ({ children }: { children?: ReactNode }) => <span className="flex h-[19px] items-center">{children}</span>

/** Something centred on the banner: the lock, the Egg. */
const OnBanner = ({ children }: { children: ReactNode }) => <span className="grid h-full place-items-center">{children}</span>

/**
 * Under the banner, the same three rows in every state, so the widget never changes size: a line (the tags, or the
 * state in words), the gauge (or the room it takes), and the small print. Each is one line; the whole is in the label.
 */
function DayCareRows({ top, meter, bottom }: { top: ReactNode; meter?: ReactNode; bottom: ReactNode }) {
  return (
    <span className="grid w-full grid-rows-[22px_6px_15px] gap-[5px]">
      <span className="flex min-w-0 items-center">{top}</span>
      <span>{meter}</span>
      <span className="truncate font-pixel-sm text-[15px] leading-none text-muted">{bottom}</span>
    </span>
  )
}

/**
 * The Day Care, one for every region: its banner, with your two standing on it and the levels they gained there under
 * them (MAX at the level cap), the gauge to the next Egg check and its time; locked (how close, all regions counted);
 * or, with an Egg waiting, gold with the Egg shaking on the banner. The same size in every state. It only ever opens
 * the Day Care page (with an Egg, straight into the hatching).
 */
function DayCareWidget() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const now = useNow(30_000)
  const cfg = data.config.dayCare
  if (!isDayCareOpen(save, data)) {
    const have = Math.min(speciesCaughtEverywhere(save), cfg.unlockPokedex)
    return (
      <Widget
        title={t('ui.home.dayCare')}
        tag={<HeadTag />}
        label={t('ui.home.dcLockedLabel', { count: cfg.unlockPokedex, n: have })}
        onClick={() => pushToast(t('ui.home.dcLockedToast', { count: cfg.unlockPokedex }))}
      >
        <DayCareBanner dim>
          {() => (
            <OnBanner>
              <PixelIcon name="lock" size={16} />
            </OnBanner>
          )}
        </DayCareBanner>
        <DayCareRows
          top={<span className="truncate text-[20px] leading-none">{t('ui.home.dcCaught', { n: have, max: cfg.unlockPokedex })}</span>}
          meter={<Meter value={have} max={cfg.unlockPokedex} />}
          bottom={t('ui.home.dcOpensAll')}
        />
      </Widget>
    )
  }
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
  const check = nextCheckProgress(save, data, now)
  const next = t('ui.home.dcNextCheck', { time: waitText(check.at - now) })
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
                  <span key={`free-${i}`} className="truncate text-center font-pixel-sm text-[14px] leading-none text-muted">
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
        meter={<Meter value={check.done} max={1} />}
        bottom={next}
      />
    </Widget>
  )
}

/** Versus: locked (how close the team is), open (set a team), then teams to beat and defense wins. */
/** The Versus widget's banner: Galar's stadium under its floodlights (public/region-art). */
const VS_BANNER = '/region-art/galar.png'

function VersusWidget() {
  const { t, tPlural } = useT()
  const navigate = useNavigate()
  const save = useGame((s) => s.save)!
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
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

  const team = (
    <span className="flex pl-1" aria-hidden>
      {teamOf(save).map((p) => (
        <MiniSprite
          key={p.id}
          dex={p.dex}
          size={34}
          className={cx('-mx-1.5', !open && 'opacity-50 grayscale')}
        />
      ))}
    </span>
  )
  if (!open) {
    const n = Math.min(versusReadyCount(save, data), VERSUS_TEAM_SIZE)
    const best = Math.max(...save.box.map((p) => p.level))
    return (
      <Widget
        title={t('ui.versus.title')}
        tag={<PixelIcon name="lock" size={16} />}
        label={`${t('ui.versus.locked')} ${t('ui.versus.lockedCount', { n })}`}
        onClick={() => navigate('/versus')}
      >
        <span className="flex min-h-[30px] items-center">{team}</span>
        <span className="text-[20px] leading-none">{t('ui.versus.lockedCount', { n })}</span>
        <Meter value={n} max={VERSUS_TEAM_SIZE} />
        <span className="font-pixel-sm text-[15px] leading-none text-muted">
          {t('ui.home.bestLevel', { n: best })}
        </span>
      </Widget>
    )
  }
  const me = board?.find((r) => r.isMe)
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
          style={{ imageRendering: 'pixelated', objectPosition: '50% 55%' }}
        />
        <span className="absolute inset-y-0 left-1 flex items-center gap-1" aria-hidden>
          {shown.slice(0, VERSUS_TEAM_SIZE).map((m, i) => (
            <MiniSprite key={i} dex={m.dex} size={44} className="-mx-1.5" />
          ))}
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

/** Home's widgets, two by two: the secret area and the Day Care, then Versus and one square per special event. */
export function Widgets({ onSecrets }: { onSecrets: () => void }) {
  return (
    <div className="grid grid-cols-2 content-start gap-2.5">
      <SecretWidget onSecrets={onSecrets} />
      <DayCareWidget />
      <VersusWidget />
      <EventWidgets />
    </div>
  )
}
