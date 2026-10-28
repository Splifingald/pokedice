// Trick or Treat's pieces (docs/29, docs/15 §28): the ghost on the battle's stage (the area's picture, the ghost at its
// centre, the Treat's and the Trick Ball's timelines over it), the gauge with its sections and their dice, the
// encounter's preview card and the rules. They only draw what the engine decided (engine/trickOrTreat.ts); the area
// screen (TrickView) plays the steps. Every state is on /kitchen-sink (TrickBits).
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  TRICK_GAUGE_MAX,
  failPush,
  treatRange,
  trickBand,
  trickCfg,
  trickChance,
  trickZoneAt,
  type TrickBand,
  type TrickTier,
} from '@/engine'
import { artPlacement, artUrl, battleWindow, pictureOf } from '@/fx/areaArt'
import { softEllipse, canvas } from '@/fx/pixel'
import { setArtUnderStage, TRICK_BALL_URL } from '@/fx/scenes'
import { placeSprite, spriteError, stageSprite } from '@/fx/sprites'
import { H, W, type Hud, type Timeline } from '@/fx/timeline'
import { TREAT_URL } from '@/fx/timelines/trick'
import { useT } from '@/i18n/react'
import { useShowdownDown, watchShowdown } from '@/lib/showdownReach'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { AreaArt } from './AreaArt'
import { Die } from './Die'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'
import { StageCanvas } from './StageCanvas'

export const TREAT_SRC = TREAT_URL
export const TRICK_BALL_SRC = TRICK_BALL_URL

/** Where the ghost floats on the 240 × 160 stage (its feet: centred, a little low so a tall ghost clears the plate). */
export const TRICK_AT = { x: W / 2, y: 108 }
/** The line the Trick Ball lands on, under the ghost. */
export const TRICK_GROUND = 126

/** What a section asks of the die, as words for screen readers and messages: "6", "5+", or "—" where none can. */
export const targetLabel = (need: number): string =>
  need > 6 ? '—' : need >= 6 ? '6' : `${Math.max(1, need)}+`

/**
 * A section's colour, one per die so no two sections look alike (the user's call, 2026-10-15): red for the hardest
 * (a 6), then orange, yellow, green and teal as it gets easier; lilac where no roll can. Each takes ink text at 4.5:1
 * or more (the chips under the gauge). Art: the same in Dusk.
 */
const ZONE_COLOR: Record<number, string> = {
  7: '#b7a6dd',
  6: '#ff6b5a',
  5: '#ff8a3d',
  4: '#ffd23f',
  3: '#7ccf4f',
  2: '#36c2b4',
  1: '#36c2b4',
}
const zoneColor = (need: number) => ZONE_COLOR[Math.max(1, Math.min(7, need))]!
/** The flee zone: the night, striped. */
const FLEE_BG = 'repeating-linear-gradient(135deg, #1a0f2b 0 4px, #2c1840 4px 8px)'

/** The Treat or the Trick Ball, as the item pictures are drawn (30 × 30, pixelated). */
export function TrickSprite({
  kind,
  size = 30,
  className,
  style,
}: {
  kind: 'treat' | 'ball'
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <img
      src={kind === 'treat' ? TREAT_SRC : TRICK_BALL_SRC}
      alt=""
      aria-hidden
      draggable={false}
      width={size}
      height={size}
      className={cx('pixelated select-none', className)}
      style={style}
    />
  )
}

/**
 * What a section needs, as the game's own die: its face, and a "+" when a higher roll catches too (a 6 is a 6; "—"
 * where no roll can). `plus={false}` drops the "+" where there's no room for it (a narrow section on the gauge).
 */
export function NeedDie({
  need,
  size = 20,
  plus = true,
  className,
}: {
  need: number
  size?: number
  plus?: boolean
  className?: string
}) {
  const { t } = useT()
  const target = targetLabel(need)
  if (need > 6)
    return (
      <span className={className} aria-label={t('ui.trick.needs', { target })} role="img">
        —
      </span>
    )
  const v = Math.max(1, need)
  return (
    <span className={cx('inline-flex items-center gap-px leading-none', className)}>
      <Die
        type="base"
        face={{ kind: 'number', value: v }}
        size={size}
        label={t('ui.trick.needs', { target })}
      />
      {plus && v < 6 && <span aria-hidden>+</span>}
    </span>
  )
}

/** A box's width in CSS pixels, kept up to date. */
function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setW(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * The gauge: its value in numbers ("62/100") with what the last Treat or miss added ("+18"), then its sections end to
 * end (each in its own colour, a dark line between two, the flee zone striped night with a ghost), the part filled so
 * far bright and the rest a pastel,
 * the section it is in ringed in gold, the white post where it stands, and under each section the die a Trick Ball
 * needs there (with its "+"; only the face where a section is narrow), then Flees. A meter for screen readers.
 */
export function TrickGauge({
  band,
  value,
  delta,
  lead,
  numbers = true,
  instant,
  className,
}: {
  band: TrickBand
  value: number
  /** What the last Treat or miss added: shown beside the value, popping in each time `key` changes. */
  delta?: { n: number; key: number } | null
  /** Left of the value: what the last step did (the screen's readout); the gauge's name when there's none. */
  lead?: ReactNode
  /** The value row (the admin's preview has none). */
  numbers?: boolean
  instant?: boolean
  className?: string
}) {
  const { t } = useT()
  const v = Math.max(0, Math.min(TRICK_GAUGE_MAX, value))
  const here = trickZoneAt(band, v)
  const pct = (x: number) => `${(x / TRICK_GAUGE_MAX) * 100}%`
  const [box, width] = useBoxWidth<HTMLDivElement>()
  const px = (from: number, to: number) => (width * (to - from)) / TRICK_GAUGE_MAX
  const zones = (dim: boolean) => (
    <>
      {dim && <i className="absolute inset-0 block bg-[#f4f1fa]" />}
      {band.zones.map((z) => (
        <i
          key={z.from}
          className="absolute inset-y-0 block"
          style={{
            left: pct(z.from),
            width: pct(z.to - z.from),
            background: zoneColor(z.need),
            // The part not reached yet stays readable: a pastel of its colour (over the light base below), never mud.
            opacity: dim ? 0.42 : 1,
            // A dark line between sections, so two neighbours never blur into one.
            boxShadow: z.from > 0 ? 'inset 2px 0 0 #1a0f2b' : undefined,
          }}
        />
      ))}
      <i
        className="absolute inset-y-0 right-0 block"
        style={{ left: pct(band.flee), background: FLEE_BG, opacity: dim ? 0.55 : 1 }}
      />
    </>
  )
  return (
    <div ref={box} className={cx('flex flex-col gap-1', className)}>
      {numbers && (
        <div className="flex min-h-[38px] items-center justify-between gap-2">
          {lead ?? (
            <span className="flex min-w-0 items-center gap-1.5 font-pixel-sm text-[16px] leading-none text-muted">
              <PixelIcon name="pumpkin" size={16} />
              <span className="truncate">{t('ui.trick.gauge')}</span>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            {delta && delta.n > 0 && (
              <span key={delta.key} className="tt-pop" aria-hidden>
                <span className="pixel-corners inline-flex bg-gold px-1.5 pb-[3px] pt-[2px] font-pixel-sm text-[16px] leading-none text-ink shadow-ring">
                  {t('ui.trick.delta', { n: delta.n })}
                </span>
              </span>
            )}
            <b className="font-pixel text-[24px] font-normal leading-none tabular-nums" aria-hidden>
              {v}
              <span className="text-[18px] text-muted">/{TRICK_GAUGE_MAX}</span>
            </b>
          </span>
        </div>
      )}
      <div className="relative">
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={TRICK_GAUGE_MAX}
          aria-valuenow={v}
          aria-label={t('ui.trick.gauge')}
          aria-valuetext={t('ui.trick.gaugeValue', {
            value: v,
            zone: here
              ? t('ui.trick.zoneCatch', { target: targetLabel(here.zone.need) })
              : t('ui.trick.zoneFlee'),
          })}
          className="pixel-corners relative h-7 overflow-hidden bg-night shadow-ring"
        >
          {zones(true)}
          <div
            className={cx('absolute inset-0', instant ? 'tt-fill-now' : 'tt-fill')}
            style={{ clipPath: `inset(0 ${100 - (v / TRICK_GAUGE_MAX) * 100}% 0 0)` }}
            aria-hidden
          >
            {zones(false)}
          </div>
          {/* What was just added lights up white for two frames, as a hit's silhouette does. */}
          {delta && delta.n > 0 && !instant && (
            <i
              key={delta.key}
              className="tt-gain absolute inset-y-0 block bg-white"
              style={{ left: pct(Math.max(0, v - delta.n)), width: pct(Math.min(v, delta.n)) }}
              aria-hidden
            />
          )}
          {here && (
            <i
              className="absolute inset-y-0 block shadow-[inset_0_0_0_3px_#ffbe2e]"
              style={{ left: pct(here.zone.from), width: pct(here.zone.to - here.zone.from) }}
              aria-hidden
            />
          )}
          <span
            className="absolute inset-y-0 right-0 flex items-center justify-center"
            style={{ left: pct(band.flee) }}
            aria-hidden
          >
            <PixelIcon name="ghost" size={16} />
          </span>
        </div>
        {/* Where the gauge stands: a white post with an ink edge, taller than the track, readable on every section. */}
        <i
          className="absolute -bottom-1 -top-1 block w-[6px] -translate-x-1/2 bg-white shadow-[0_0_0_2px_#24304f]"
          style={{
            left: pct(Math.min(v, TRICK_GAUGE_MAX - 1)),
            transition: instant ? 'none' : 'left 480ms steps(8, end)',
          }}
          aria-hidden
        />
      </div>
      <div className="relative h-[28px] font-pixel-sm text-[16px] leading-none" aria-hidden>
        {band.zones.map((z) => {
          const lit = here?.zone.from === z.from
          const room = px(z.from, z.to)
          // The die and its "+" where there's room; the face alone in a narrow section; nothing in a sliver.
          if (width && room < 16) return null
          return (
            <span
              key={z.from}
              className="absolute top-0 flex justify-center"
              style={{ left: pct(z.from), width: pct(z.to - z.from) }}
            >
              <span
                className={cx(
                  'light-scope flex items-center px-1.5 py-[3px] text-ink',
                  lit ? 'shadow-[0_0_0_2px_#24304f,0_0_0_4px_#ffbe2e]' : 'shadow-ring-line',
                )}
                style={{ background: zoneColor(z.need) }}
              >
                <NeedDie need={z.need} size={room >= 34 || !width ? 16 : 14} plus={room >= 34 || !width} />
              </span>
            </span>
          )
        })}
        <span className="absolute top-0 flex justify-center" style={{ left: pct(band.flee), right: 0 }}>
          <span className={cx('px-1 pb-0.5 pt-[3px]', !here ? 'bg-crimson text-white' : 'text-danger')}>
            {!width || px(band.flee, TRICK_GAUGE_MAX) >= 30 ? (
              t('ui.trick.flees')
            ) : (
              <PixelIcon name="ghost" size={12} />
            )}
          </span>
        </span>
      </div>
    </div>
  )
}

/** A full-stage timeline over the ghost (the Treat, the Trick Ball), as the battle's StageOverlay. */
export interface TrickOverlay {
  timeline: Timeline<unknown>
  ready: Promise<unknown>
  label: string
  hud?: Hud
  onEnd: () => void
}

/** The ghost's shadow on the ground under it, dithered like the ball's. */
function Shadow() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    const c = canvas(W, H)
    softEllipse(c.g, TRICK_AT.x, TRICK_AT.y + 10, 16, 4, '#00000066', 0.6)
    g.drawImage(c, 0, 0)
  }, [])
  return (
    <canvas ref={ref} width={W} height={H} aria-hidden className="pixelated absolute inset-0 h-full w-full" />
  )
}

/**
 * The ghost on the battle's stage: 240 × 160 art pixels scaled up, the area's picture as the battle cuts it (a night
 * sky where there's none), the ghost at the centre as the page's animated sprite, floating in pixel steps (still when
 * `still`), its shadow under it. While a Treat or a Trick Ball plays, its timeline's canvas takes over, as the battle's
 * catch does. At rest after the end: the Trick Ball on the ground (caught), or nobody (fled).
 */
export function TrickStage({
  areaId,
  dex,
  shiny,
  overlay,
  rest = 'float',
  still,
  label,
  children,
}: {
  areaId: string | null
  dex: number
  shiny?: boolean
  overlay?: TrickOverlay | null
  /** What shows with no timeline playing. */
  rest?: 'float' | 'caught' | 'fled'
  still?: boolean
  label: string
  /** The plate over the stage. */
  children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  const pic = pictureOf(areaId)
  // Showdown failing or stalling brings the local sprite (src/lib/showdownReach.ts).
  const down = useShowdownDown()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const s = useMemo(() => stageSprite(dex, false, !!shiny), [dex, shiny, down])
  const at = placeSprite(s, TRICK_AT.x, TRICK_AT.y)
  // The timelines draw no background of their own: the picture (or the night) shows through the canvas.
  useLayoutEffect(() => {
    setArtUnderStage(true)
    return () => setArtUnderStage(false)
  }, [])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / W)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ghost = !overlay && rest === 'float'
  return (
    <div
      ref={box}
      className="relative isolate z-0 aspect-[3/2] w-full select-none overflow-hidden"
      style={{ background: 'linear-gradient(#1c1236, #3b2560 70%, #2a1a44)' }}
    >
      {/* The scene is one picture for screen readers; the plate on top is read on its own. */}
      <div role="img" aria-label={label} className="absolute inset-0" />
      {pic && <AreaArt key={pic.id} src={pic.url} place={artPlacement(battleWindow(pic))} />}
      {ghost && <Shadow />}
      {scale > 0 && ghost && (
        <div
          className={cx('absolute', !still && 'tt-float')}
          style={{
            left: at.left * scale,
            top: at.top * scale,
            width: at.w * scale,
            height: at.h * scale,
            ['--tt-float' as string]: `${-3 * scale}px`,
          }}
        >
          <img
            ref={watchShowdown}
            src={s.url}
            alt=""
            draggable={false}
            onError={spriteError(s)}
            className="pixelated absolute inset-0 h-full w-full max-w-none"
          />
        </div>
      )}
      {scale > 0 && !overlay && rest === 'caught' && (
        <TrickSprite
          kind="ball"
          size={Math.round(30 * scale)}
          className="absolute"
          style={{
            left: (TRICK_AT.x - 15) * scale,
            top: (TRICK_GROUND - 15) * scale,
            filter: 'brightness(0.8)',
          }}
        />
      )}
      {overlay && (
        <StageCanvas
          key="overlay"
          timeline={overlay.timeline}
          ready={overlay.ready}
          hud={overlay.hud}
          onEnd={overlay.onEnd}
          label={overlay.label}
          className="absolute inset-0"
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto">{children}</div>
    </div>
  )
}

/** The encounter's preview: the ghost, its level and rarity, NEW, and what's to come. */
export function TrickCard({
  dex,
  level,
  tier,
  isNew,
  shiny,
}: {
  dex: number
  level: number
  tier: TrickTier
  isNew: boolean
  shiny?: boolean
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const sp = data.species[dex]
  const name = sp?.name ?? `#${dex}`
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <span className="shrink-0 shadow-ring" style={{ background: 'linear-gradient(#1c1236, #3b2560)' }}>
        <SpriteImg dex={dex} size={104} shiny={shiny} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[30px] leading-none">{name}</span>
          <TierChip tier={tier} />
          {isNew && (
            <span className="light-scope bg-gold px-1.5 text-lg leading-tight text-ink shadow-ring">
              {t('ui.enc.new')}
            </span>
          )}
          {shiny && (
            <span className="inline-flex items-center gap-1 bg-paper px-1.5 text-lg leading-tight text-ink shadow-ring">
              <PixelIcon name="star" size={14} /> {t('ui.mon.shinyTag')}
            </span>
          )}
        </div>
        <span className="text-2xl leading-none">{t('ui.common.level.short', { n: level })}</span>
        <p className="copy m-0 text-[17px] text-muted">{t('ui.trick.intro', { name })}</p>
        <div className="flex items-center gap-2 text-lg leading-tight">
          <TrickSprite kind="treat" size={30} />
          <TrickSprite kind="ball" size={30} />
          <span className="text-muted">{t('ui.trick.free')}</span>
        </div>
      </div>
    </div>
  )
}

/** The ghost's rarity: a word on a chip in its colour (never colour alone). */
export function TierChip({ tier }: { tier: TrickTier }) {
  const { t } = useT()
  const tone =
    tier === 'common'
      ? 'bg-paper text-ink'
      : tier === 'rare'
        ? 'light-scope bg-gold-light text-ink'
        : 'bg-night text-gold-light'
  return (
    <span className={cx('inline-flex items-center gap-1 px-1.5 text-lg leading-tight shadow-ring', tone)}>
      {tier !== 'common' && <PixelIcon name="sparkle" size={12} />}
      {t(`ui.trick.tier.${tier}`)}
    </span>
  )
}

/** Its rules, with the config's numbers: Treats, Trick Balls, a miss, the flee zone. */
export function useTrickRules(): RuleRow[] {
  const { t } = useT()
  const cfg = trickCfg(useGame((s) => s.data))
  const { min, max } = treatRange(cfg)
  const zones = trickBand(cfg, 'common').zones
  const best = zones[zones.length - 1]!
  return [
    {
      icon: <TrickSprite kind="treat" size={30} />,
      title: t('ui.trick.rules.treat.title'),
      text: t('ui.trick.rules.treat.text', { min, max }),
    },
    {
      icon: <TrickSprite kind="ball" size={30} />,
      title: t('ui.trick.rules.ball.title'),
      text: t('ui.trick.rules.ball.text', {
        target: targetLabel(best.need),
        pct: Math.round(trickChance(best.need) * 100),
      }),
    },
    {
      icon: 'dice',
      title: t('ui.trick.rules.miss.title'),
      text: t('ui.trick.rules.miss.text', { push: failPush(cfg) }),
    },
    { icon: 'ghost', title: t('ui.trick.rules.flee.title'), text: t('ui.trick.rules.flee.text') },
  ]
}

/** The rules pop-up's banner: the haunted picture, a Treat and a Trick Ball on it. */
function TrickBanner() {
  return (
    <>
      <img
        src={artUrl('haunted')}
        alt=""
        className="pixelated absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 60%' }}
      />
      <span className="absolute bottom-2 right-3 flex items-end gap-2" aria-hidden>
        <TrickSprite kind="treat" size={48} />
        <TrickSprite kind="ball" size={48} />
      </span>
    </>
  )
}

/** Trick or Treat's rules (docs/15 §20): once, the first time a ghost floats in (Later / Let's go!), then from INFO. */
export function TrickRulesModal({
  open,
  onClose,
  onGo,
}: {
  open: boolean
  onClose: () => void
  onGo?: () => void
}) {
  const { t } = useT()
  const rules = useTrickRules()
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.trick.title')}
      picture={<TrickBanner />}
      icon="pumpkin"
      rules={rules}
      onGo={onGo}
    />
  )
}
