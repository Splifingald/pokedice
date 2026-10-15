// Trick or Treat's pieces (docs/29, docs/15 §28): the ghost over its area, the gauge with its sections, the Treat and
// the Trick Ball, the result, the encounter's preview card and the rules. They only draw what the engine decided
// (engine/trickOrTreat.ts); the area screen (TrickView) plays the steps. Every state is on /kitchen-sink (TrickBits).
import { motion } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'
import {
  TRICK_GAUGE_MAX,
  failPush,
  treatRange,
  trickBand,
  trickCfg,
  trickChance,
  trickZoneAt,
  type TrickBand,
  type TrickPlaced,
  type TrickTier,
} from '@/engine'
import { artPlacement, artUrl, battleWindow, pictureOf } from '@/fx/areaArt'
import { useT } from '@/i18n/react'
import { useIsDesktop } from '@/lib/useMediaQuery'
import { useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { AreaArt } from './AreaArt'
import { PixelIcon } from './icons'
import { RulesModal, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'

export const TREAT_SRC = '/items/treat.png'
export const TRICK_BALL_SRC = '/items/trick-ball.png'

/** What a section asks of the die, as the gauge writes it: "6", "5+", or "—" where no roll can catch. */
export const targetLabel = (need: number): string =>
  need > 6 ? '—' : need >= 6 ? '6' : `${Math.max(1, need)}+`

/** A section's colour, from the hardest (deep purple) to the easiest (pumpkin, then gold). Art: the same in Dusk. */
const ZONE_COLOR: Record<number, string> = {
  7: '#3b2a5c',
  6: '#5b3a9e',
  5: '#8a4fc0',
  4: '#c45fa0',
  3: '#ff8a3d',
  2: '#ffbe2e',
  1: '#ffe066',
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
 * The gauge: its sections end to end (each in its colour, the flee zone striped night with a ghost), the part filled so
 * far bright and the rest dim, the section the gauge is in ringed in gold, and under each section what a Trick Ball
 * needs there. A meter for screen readers, its value in words.
 */
export function TrickGauge({
  band,
  value,
  instant,
  className,
}: {
  band: TrickBand
  value: number
  instant?: boolean
  className?: string
}) {
  const { t } = useT()
  const v = Math.max(0, Math.min(TRICK_GAUGE_MAX, value))
  const here = trickZoneAt(band, v)
  const pct = (x: number) => `${(x / TRICK_GAUGE_MAX) * 100}%`
  const zones = (dim: boolean) => (
    <>
      {band.zones.map((z) => (
        <i
          key={z.from}
          className="absolute inset-y-0 block"
          style={{
            left: pct(z.from),
            width: pct(z.to - z.from),
            background: zoneColor(z.need),
            opacity: dim ? 0.28 : 1,
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
    <div className={cx('flex flex-col gap-1', className)}>
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
      <div className="relative h-5 font-pixel-sm text-[15px] leading-none tabular-nums" aria-hidden>
        {band.zones.map((z) => {
          const lit = here?.zone.from === z.from
          return (
            <span
              key={z.from}
              className="absolute top-0 flex justify-center"
              style={{ left: pct(z.from), width: pct(z.to - z.from) }}
            >
              <span
                className={cx(
                  'px-1 pb-0.5 pt-px',
                  lit ? 'light-scope bg-gold text-ink shadow-ring-line' : 'text-muted',
                )}
              >
                {targetLabel(z.need)}
              </span>
            </span>
          )
        })}
        <span className="absolute top-0 flex justify-center" style={{ left: pct(band.flee), right: 0 }}>
          <span className={cx('px-1 pb-0.5 pt-px', !here ? 'bg-crimson text-white' : 'text-danger')}>
            {t('ui.trick.flees')}
          </span>
        </span>
      </div>
    </div>
  )
}

/** How the stage looks right now: the screen moves it from step to step. */
export interface TrickLook {
  /** The gauge as shown (it fills after the Treat is eaten, or the ball breaks open). */
  gauge: number
  ghost: 'float' | 'munch' | 'absorb' | 'hidden' | 'out' | 'flee'
  /** A Treat in the air; the number replays the toss. */
  treat: number | null
  /** The Trick Ball: flying to the ghost, on the ground (each `wobble` a new wobble), caught (the stars), or none. */
  ball: { at: 'fly' | 'ground' | 'caught'; wobble: number; key: number } | null
}

export const restLook = (gauge: number, end: 'caught' | 'fled' | null = null): TrickLook => ({
  gauge,
  ghost: end === 'caught' ? 'hidden' : end === 'fled' ? 'flee' : 'float',
  treat: null,
  ball: end === 'caught' ? { at: 'caught', wobble: 0, key: 0 } : null,
})

/** A pixel-art arc: `n` points of a parabola from (x0, y0) to (x1, y1), its top `lift` above the straight line. */
function arc(x0: number, y0: number, x1: number, y1: number, lift: number, n = 9) {
  const xs: string[] = []
  const ys: string[] = []
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1)
    xs.push(`${x0 + (x1 - x0) * k}%`)
    ys.push(`${y0 + (y1 - y0) * k - lift * 4 * k * (1 - k)}%`)
  }
  return { left: xs, top: ys }
}
/** Each stretch of an arc in two steps: it moves like pixel art, not a glide. */
const stepEase = (k: number) => Math.floor(k * 2) / 2

const GHOST_TOP = 44
const GROUND_TOP = 74
const STARS = [
  [-34, -26],
  [34, -26],
  [-44, 4],
  [44, 4],
  [-20, -40],
  [20, -40],
]

/**
 * The ghost at the centre of its area's picture (the battle's window of it; a night sky stands in where there's
 * none), floating; the Treat tossed in an arc from the left, the Trick Ball from the right, which then lies on the
 * ground and wobbles; stars for a catch. `still`: no idle float (the OS asks for less motion, or animations are off).
 */
export function TrickStage({
  areaId,
  dex,
  shiny,
  look,
  still,
  speed = 1,
  label,
  children,
}: {
  areaId: string | null
  dex: number
  shiny?: boolean
  look: TrickLook
  still?: boolean
  /** × the flights' durations (the short motion level plays them faster). */
  speed?: number
  label: string
  children?: ReactNode
}) {
  const desktop = useIsDesktop()
  const pic = pictureOf(areaId)
  const size = desktop ? 160 : 120
  const ghostClass =
    look.ghost === 'munch'
      ? 'tt-munch'
      : look.ghost === 'absorb'
        ? 'tt-absorb'
        : look.ghost === 'out'
          ? 'tt-out'
          : look.ghost === 'flee'
            ? 'tt-flee'
            : undefined
  return (
    <div
      role="img"
      aria-label={label}
      className={cx('relative isolate aspect-[3/2] w-full overflow-hidden shadow-ring', still && 'tt-still')}
      style={{ background: 'linear-gradient(#1c1236, #3b2560 70%, #2a1a44)' }}
    >
      {pic && <AreaArt key={pic.id} src={pic.url} place={artPlacement(battleWindow(pic))} />}
      {/* The ghost, its feet on nothing. */}
      <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: `${GHOST_TOP}%` }}>
        <div className={look.ghost === 'float' || look.ghost === 'munch' ? 'tt-float' : undefined}>
          <div
            key={`${look.ghost}-${look.ball?.key ?? 0}-${look.treat ?? 0}`}
            className={ghostClass}
            style={look.ghost === 'hidden' ? { opacity: 0 } : undefined}
          >
            <SpriteImg dex={dex} size={size} shiny={shiny} />
          </div>
        </div>
      </div>
      {look.treat != null && (
        <motion.span
          key={`treat-${look.treat}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          initial={false}
          animate={arc(14, 96, 50, GHOST_TOP + 4, 34)}
          transition={{ duration: 0.52 * speed, ease: stepEase }}
          aria-hidden
        >
          <TrickSprite kind="treat" size={36} />
        </motion.span>
      )}
      {look.ball?.at === 'fly' && (
        <motion.span
          key={`ball-${look.ball.key}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          initial={false}
          animate={arc(86, 96, 50, GHOST_TOP + 2, 34)}
          transition={{ duration: 0.52 * speed, ease: stepEase }}
          aria-hidden
        >
          <TrickSprite kind="ball" size={36} />
        </motion.span>
      )}
      {look.ball && look.ball.at !== 'fly' && (
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: '50%', top: `${GROUND_TOP}%` }}
          aria-hidden
        >
          <span
            key={look.ball.wobble}
            className={cx('block', look.ball.wobble > 0 && look.ball.at === 'ground' && 'tt-wobble')}
          >
            <TrickSprite kind="ball" size={40} />
          </span>
          {look.ball.at === 'caught' &&
            STARS.map(([dx, dy], i) => (
              <span
                key={i}
                className="tt-star absolute left-1/2 top-1/2 -ml-2 -mt-2"
                style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }}
              >
                <PixelIcon name="sparkle" size={16} />
              </span>
            ))}
        </span>
      )}
      {children}
    </div>
  )
}

/** The end: caught (where it went, NEW, a secret area it opened) or fled into the night. */
export function TrickResult({
  name,
  dex,
  shiny,
  level,
  end,
  placed,
  isNew,
  replacedLevel,
  secrets = [],
}: {
  name: string
  dex: number
  shiny?: boolean
  level: number
  end: 'caught' | 'fled'
  placed?: TrickPlaced
  isNew?: boolean
  replacedLevel?: number
  /** Names of the secret areas this catch opened. */
  secrets?: string[]
}) {
  const { t } = useT()
  const caught = end === 'caught'
  return (
    <div
      className={cx(
        'flex items-center gap-3 p-3',
        caught ? 'bg-cream shadow-card-warm' : 'bg-paper shadow-card',
      )}
    >
      <span className={cx('shrink-0', !caught && 'opacity-50 grayscale')}>
        <SpriteImg dex={dex} size={64} shiny={shiny} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[24px] font-normal leading-none">
            {caught ? t('ui.trick.caughtTitle', { name }) : t('ui.trick.fledTitle', { name })}
          </b>
          {caught && isNew && (
            <span className="light-scope bg-gold px-1.5 text-lg leading-tight text-ink shadow-ring">
              {t('ui.enc.new')}
            </span>
          )}
          {caught && shiny && (
            <span className="inline-flex items-center gap-1 bg-paper px-1.5 text-lg leading-tight text-ink shadow-ring">
              <PixelIcon name="star" size={14} /> {t('ui.mon.shinyTag')}
            </span>
          )}
        </div>
        <p className="copy m-0 text-[17px] text-muted">
          {caught
            ? `${t('ui.common.level.short', { n: level })} · ${t(`ui.trick.placed.${placed ?? 'box'}`, { level: replacedLevel ?? 0 })}`
            : t('ui.trick.fledText')}
        </p>
        {secrets.map((s) => (
          <p key={s} className="m-0 text-lg leading-tight text-good">
            {t('ui.victory.secretOnMap', { name: s })}
          </p>
        ))}
      </div>
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
