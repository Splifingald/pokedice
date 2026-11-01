// Tracks in the Snow (docs/61 §4.1, docs/15 §46): Moonlit Glade's hide and seek on the game's screens. Its way in (the
// moon rising, a reindeer leaping into the bushes, "Tap to continue ▼", then the pop-up with its short rules), the
// gauge of rounds, the glade itself (a grid of snowy bushes that fits a 360 px phone at 4 × 4: what each opened bush
// held and its hoofprints, the taps left, the snow falling over it) and the outro (the bushes settle, fresh snow).
// The scenes and the bushes are the pixel engine's (src/fx/timelines/tracks.ts). Every number and draw comes from the
// engine (the area's mode, the glade in the save); these pieces only show them.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TracksBush, TracksMode, TracksPrint } from '@/engine'
import { playCry } from '@/audio/cries'
import { loadSprite, spriteKey } from '@/fx/sprites'
import {
  bushSprite,
  gladeLoop,
  openBushSprite,
  snowfallCoverAt,
  tracksIntroTimeline,
  tracksOutroTimeline,
  tracksSnowfallTimeline,
} from '@/fx/timelines/tracks'
import { useT } from '@/i18n/react'
import { useHoldFullscreen } from '@/lib/fullscreen'
import { useMotion } from '@/lib/motion'
import { cx } from '@/theme/util'
import { PixelIcon } from './icons'
import { Modal } from './Modal'
import { PixelButton } from './PixelButton'
import { useBoxSize, useFullStage, useLoop } from './PortalFx'
import { RulesModal, RuleList, type RuleRow } from './RulesModal'
import { SpriteImg } from './SpriteImg'
import { StageCanvas } from './StageCanvas'

/** Stantler: who hides in the glade. */
export const STANTLER = 234

// ------------------------------------------------------------------ small pixel pictures

const PAL: Record<string, string> = {
  b: '#5c6fa6',
  B: '#2e4a8a',
  w: '#f4f8ff',
  s: '#c4d2ee',
  R: '#8a3a2a',
  r: '#b2553a',
  o: '#7a4a28',
  y: '#ffd23a',
  d: '#3a2214',
  g: '#1d4a3c',
  G: '#2f6c52',
  k: '#0f2c26',
}

/** A pixel picture from rows of palette letters ('.' clear), as PixelIcon draws its own. */
function PixelMap({
  rows,
  size,
  className,
  color,
}: {
  rows: readonly string[]
  size: number
  className?: string
  /** Every pixel in this one colour (a light print on the night's blue). */
  color?: string
}) {
  const w = rows[0]!.length
  const h = rows.length
  return (
    <svg
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color ?? PAL[ch]} />
          ),
        ),
      )}
    </svg>
  )
}

/** Two hoofprints, a stride apart, pointing up (toes narrow at the top). */
const HOOF = [
  '.......b.b.',
  '......bb.bb',
  '......bb.bb',
  '......bb.bb',
  '.......b.b.',
  '...........',
  '.b.b.......',
  'bb.bb......',
  'bb.bb......',
  'bb.bb......',
  '.b.b.......',
]

const CABIN = [
  '....wwww....',
  '..wwwwwwww..',
  '.wwRRRRRRww.',
  'wRRrRRRRrRRw',
  '.oooooooooo.',
  '.oyyoooddoo.',
  '.oyyoooddoo.',
  '.ooooooddoo.',
]

const SNOWFLAKE = ['..w..', 'w.w.w', '.www.', 'w.w.w', '..w..']

const ANGLE: Record<TracksPrint, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 }

/** The hoofprints pointing `dir`, as they show on an opened bush. */
export function Hoofprints({
  dir,
  size = 22,
  className,
}: {
  dir: TracksPrint
  size?: number
  className?: string
}) {
  return (
    <span
      className={cx('inline-block leading-none', className)}
      style={{ transform: `rotate(${ANGLE[dir]}deg)` }}
      data-print={dir}
      aria-hidden
    >
      <PixelMap rows={HOOF} size={size} color="#e8f0ff" />
    </span>
  )
}

export const HoofIcon = ({ size = 24, color }: { size?: number; color?: string }) => (
  <PixelMap rows={HOOF} size={size} color={color} />
)
export const CabinIcon = ({ size = 24 }: { size?: number }) => <PixelMap rows={CABIN} size={size} />
export const SnowflakeIcon = ({ size = 20 }: { size?: number }) => <PixelMap rows={SNOWFLAKE} size={size} />

/** A snowflake on a chip of the night's blue: it reads on a light panel and a dark one alike. */
export function SnowChip({ size = 14, spent = false }: { size?: number; spent?: boolean }) {
  return (
    <span
      className={cx('grid place-items-center bg-[#14224a] shadow-[0_0_0_1px_#050a1a]', spent && 'opacity-30')}
      style={{ width: size + 6, height: size + 6, borderRadius: 2 }}
    >
      <SnowflakeIcon size={size} />
    </span>
  )
}

/** A bush drawn by the pixel engine (closed and snowy, or searched), `px` CSS pixels per art pixel. */
export function BushArt({
  open = false,
  r = 7,
  px = 3,
  className,
}: {
  open?: boolean
  r?: number
  px?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const w = r * 3 + 4
  const h = r * 2 + 3
  useEffect(() => {
    const g = ref.current?.getContext('2d')
    if (!g) return
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, w, h)
    g.drawImage(open ? openBushSprite(r) : bushSprite(r), 0, 0)
  }, [open, r, w, h])
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-hidden
      className={cx('pixelated block', className)}
      style={{ width: w * px, maxWidth: '100%', imageRendering: 'pixelated' }}
    />
  )
}

// ------------------------------------------------------------------ the gauge

/**
 * The gauge of rounds (in place of the round gauge): a tile per round, hoofprints on the cleared ones (gold edge on
 * the one under way, the last one marked with a snowflake), then "1/3".
 */
export function TracksGauge({
  round,
  total,
  className,
}: {
  round: number
  total: number
  className?: string
}) {
  const { t } = useT()
  const done = Math.min(round, total)
  return (
    <div
      className={cx('flex items-center gap-2', className)}
      role="img"
      aria-label={t('ui.tracks.gauge', { done, total })}
    >
      <SnowChip size={12} />
      <ol className="flex min-w-0 flex-1 gap-[2px]" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cx(
              'flex h-6 min-w-0 flex-1 items-center justify-center border-2 bg-[#14224a]',
              i === done ? 'border-gold' : 'border-edge',
            )}
            style={{ borderRadius: 2 }}
          >
            {i < done ? (
              <HoofIcon size={12} color="#c8f4ff" />
            ) : i === total - 1 ? (
              <SnowflakeIcon size={10} />
            ) : null}
          </li>
        ))}
      </ol>
      <span className="min-w-[6ch] text-right font-mono text-xs tabular-nums leading-none" aria-hidden>
        {done}/{total}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ its rules

/**
 * Its rules, short (as the nightmare's): four one-line rows from the area's numbers: its rounds and the shiny one last,
 * the prints, the taps before the snow, what the bushes hide.
 */
export function useTracksRules(mode: TracksMode, name: string): RuleRow[] {
  const { t } = useT()
  const first = mode.rounds[0]!
  const last = mode.rounds[mode.rounds.length - 1]!
  const same = mode.rounds.every((r) => r.taps === first.taps)
  return [
    {
      icon: <SpriteImg dex={STANTLER} size={40} />,
      title: t('ui.tracks.rule.rounds', { n: mode.rounds.length, name }),
      text: '',
    },
    {
      icon: <HoofIcon />,
      title: t(mode.emptyPrintsOnly ? 'ui.tracks.rule.printsEmpty' : 'ui.tracks.rule.prints'),
      text: '',
    },
    {
      icon: <SnowChip size={20} />,
      title: same
        ? t('ui.tracks.rule.taps', { n: first.taps })
        : t('ui.tracks.rule.tapsLast', { n: first.taps, last: last.taps }),
      text: '',
    },
    { icon: <CabinIcon />, title: t('ui.tracks.rule.bushes'), text: '' },
  ]
}

/** The glade under the moon filling its box (the rules' banner, the way in's pop-up), 2 CSS pixels an art pixel. */
export function GladeScene({ className, still }: { className?: string; still?: boolean }) {
  const { level, calm } = useMotion()
  const hold = still ?? (level === 'off' || calm)
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const size = useBoxSize(box)
  const w = size ? Math.max(16, Math.ceil(size.w / 2)) : 0
  const h = size ? Math.max(16, Math.ceil(size.h / 2)) : 0
  useLoop(ref, () => (w && h ? gladeLoop(w, h, { still: hold }) : null), hold, [w, h])
  return (
    <div ref={box} aria-hidden className={cx('absolute inset-0 overflow-hidden bg-[#050a1a]', className)}>
      {w > 0 && (
        <canvas
          ref={ref}
          width={w}
          height={h}
          className="pixelated absolute left-0 top-0"
          style={{ width: w * 2, height: h * 2, imageRendering: 'pixelated' }}
        />
      )}
    </div>
  )
}

/** The rules pop-up from INFO (OK): the same short rows as the way in's pop-up. */
export function TracksRulesModal({
  open,
  onClose,
  mode,
  name,
}: {
  open: boolean
  onClose: () => void
  mode: TracksMode
  name: string
}) {
  const { t } = useT()
  const rules = useTracksRules(mode, name)
  return (
    <RulesModal
      open={open}
      onClose={onClose}
      title={t('ui.tracks.title')}
      picture={<GladeScene />}
      icon="sparkle"
      rules={rules}
    />
  )
}

// ------------------------------------------------------------------ the way in

/**
 * The way in's pop-up (as the nightmare's): the short rules, TEAM (healed as at a Pokémon Center, the team can still
 * change), NOT NOW and BEGIN THE SEARCH. Over the intro's held end, at the bottom of the screen; on its own (`banner`,
 * the kitchen sink), the glade as its picture.
 */
export function TracksEntryDialog({
  open,
  mode,
  name,
  onBegin,
  onNotNow,
  onTeam,
  banner = true,
}: {
  open: boolean
  mode: TracksMode
  name: string
  onBegin: () => void
  onNotNow: () => void
  onTeam?: () => void
  banner?: boolean
}) {
  const { t } = useT()
  const rules = useTracksRules(mode, name)
  return (
    <Modal
      open={open}
      onClose={onNotNow}
      title={t('ui.tracks.enterTitle')}
      bottom={!banner}
      className={cx('max-w-md', !banner && 'flex !max-h-[92dvh] flex-col')}
    >
      <div className={cx('flex flex-col gap-3', !banner && 'min-h-0 flex-1')}>
        {banner && (
          <div className="relative -mx-4 h-[150px] overflow-hidden bg-[#050a1a]" aria-hidden>
            <GladeScene />
          </div>
        )}
        <div className={cx(!banner && 'pixel-scroll -mr-2 min-h-0 flex-1 overflow-y-auto pr-2')}>
          <RuleList rules={rules} />
        </div>
        {onTeam && (
          <div className="flex items-center gap-2.5 bg-well p-2.5 shadow-ring-line">
            <PixelIcon name="heart" size={20} className="shrink-0" />
            <p className="m-0 min-w-0 flex-1 text-[18px] leading-tight">{t('ui.tracks.teamHint')}</p>
            <PixelButton className="shrink-0" onClick={onTeam}>
              {t('ui.portal.team')}
            </PixelButton>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton onClick={onNotNow}>{t('ui.portal.notNow')}</PixelButton>
          <PixelButton variant="primary" onClick={onBegin}>
            {t('ui.tracks.begin')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}

/** The line under a full-screen scene: a card in the glade's colours (the night, the moon's cream, the ice). */
const LINE_CARD =
  'm-0 max-w-md bg-[#0b1530] px-4 py-3 text-center leading-tight text-[#f4f8ff] shadow-[inset_0_3px_0_#f3efd6,inset_0_-3px_0_#c8f4ff,0_0_0_3px_#050a1a]'

/**
 * The intro, full screen (tracksIntroTimeline): the moon rises over the glade, a reindeer's silhouette leaps across it
 * into the bushes; the line ("Hoofprints in the fresh snow…") from its landing. Then it holds its end, "Tap to continue
 * ▼" with the focus; a tap, Enter or Space calls `onContinue`. No skip (as the nightmare's): `short` in half the time,
 * motion off its end at once. `under`: its pop-up is up over it (no prompt, no taps).
 */
export function TracksIntro({
  name,
  onContinue,
  instant = false,
  under = false,
}: {
  name: string
  onContinue: () => void
  instant?: boolean
  under?: boolean
}) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(200)
  const prompt = useRef<HTMLButtonElement>(null)
  const [line, setLine] = useState(false)
  const [end, setEnd] = useState(false)
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: loadSprite(STANTLER, false, false),
      timeline: tracksIntroTimeline({
        ...size,
        title: t('ui.tracks.title'),
        mon: spriteKey(STANTLER, false, false),
        short: level === 'short',
      }),
    }),
    // One scene per intro; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    if (end && !under) prompt.current?.focus()
  }, [end, under])
  return (
    <div
      className={cx('ts-intro fixed inset-0 overflow-hidden bg-[#050a1a]', under ? 'z-[89]' : 'z-[95]')}
      role={under ? undefined : 'dialog'}
      aria-modal={under ? undefined : true}
      aria-hidden={under || undefined}
      aria-label={under ? undefined : t('ui.tracks.title')}
      onClick={under || !end ? undefined : onContinue}
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        instant={instant}
        size={{ w: size.w, h: size.h }}
        hud={{ beat: (b) => b === 'line' && setLine(true) }}
        onEnd={() => {
          setLine(true)
          setEnd(true)
        }}
        label={t('ui.tracks.introLabel')}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6">
        <p className={cx(LINE_CARD, 'text-[24px]', !line && 'invisible')} aria-live="polite">
          {t('ui.tracks.intro', { name })}
        </p>
        {!under && end && (
          <button
            ref={prompt}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onContinue()
            }}
            className="flex min-h-[44px] items-center gap-2 px-3 font-pixel-sm text-[20px] uppercase tracking-[0.04em] text-[#f4f8ff] outline-offset-4"
          >
            {t('ui.portal.tapContinue')}
            <span aria-hidden className="blink text-[#c8f4ff]">
              ▼
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Entering the glade (as the nightmare's way in): the intro full screen, held at its end until the player taps, then
 * its pop-up over that end. `popup`: it was already up (back from the Team screen): the end and the pop-up at once.
 */
export function TracksEntry({
  mode,
  name,
  popup = false,
  onPopup,
  onBegin,
  onNotNow,
  onTeam,
}: {
  mode: TracksMode
  name: string
  popup?: boolean
  onPopup?: () => void
  onBegin: () => void
  onNotNow: () => void
  onTeam?: () => void
}) {
  const [open, setOpen] = useState(popup)
  const show = useCallback(() => {
    setOpen(true)
    onPopup?.()
  }, [onPopup])
  return (
    <>
      <TracksIntro name={name} onContinue={show} instant={popup} under={open} />
      <TracksEntryDialog
        open={open}
        banner={false}
        mode={mode}
        name={name}
        onBegin={onBegin}
        onNotNow={onNotNow}
        onTeam={onTeam}
      />
    </>
  )
}

// ------------------------------------------------------------------ the glade

/** One bush as the glade shows it: still under snow (null), or opened with what it held and its prints. */
export interface GladeBush {
  held: TracksBush | null
  print: TracksPrint | null
}

/** What an opened bush shows in its hollow. */
function Held({ held, shiny, cell }: { held: TracksBush; shiny: boolean; cell: number }) {
  const s = Math.max(16, Math.round(cell * 0.42))
  if (held === 'stantler') return <SpriteImg dex={STANTLER} shiny={shiny} size={Math.round(cell * 0.8)} />
  if (held === 'wild') return <PixelIcon name="ball" size={Math.round(s * 0.8)} />
  if (held === 'find') return <PixelIcon name="sparkle" size={Math.round(s * 0.8)} />
  if (held === 'cabin') return <CabinIcon size={s} />
  return null
}

/**
 * The glade (docs/15 §46): a square of snowy bushes, `size` a side, each a button 44 px at least, the whole fitting a
 * 360 px phone at 4 × 4. An opened bush is parted, shows what it held (a ball for a wild Pokémon, a sparkle for a find,
 * the cabin, Stantler itself) and its hoofprints pointing at Stantler. `reveal`: the bush just opened, rustling (shown
 * as it was while the snow falls over the fresh glade). `snowfall`: the snow falls over it (`onCovered` when it has
 * covered the glade, `onSnowed` when it has settled). Every bush says its row, column, what it held and its prints.
 */
export function TracksGlade({
  size,
  name,
  bushes,
  reveal = null,
  shiny = false,
  snowfall = false,
  onSnowed,
  onTap,
  disabled = false,
}: {
  size: number
  /** Stantler's name, in the player's language. */
  name: string
  bushes: readonly GladeBush[]
  reveal?: { index: number; held: TracksBush; print: TracksPrint | null } | null
  /** Stantler found here is the shiny one (the last round). */
  shiny?: boolean
  snowfall?: boolean
  onSnowed?: () => void
  onTap?: (index: number) => void
  disabled?: boolean
}) {
  const { t } = useT()
  const { level, calm } = useMotion()
  const grid = useRef<HTMLDivElement>(null)
  const box = useBoxSize(grid)
  const cell = box ? Math.floor((box.w - (size - 1) * 6) / size) : 72
  // While the snow covers the glade, the bush just opened stays as it was under it; then the fresh glade.
  const [covered, setCovered] = useState(!snowfall)
  const [settled, setSettled] = useState(!snowfall)
  useEffect(() => {
    setCovered(!snowfall)
    setSettled(!snowfall)
  }, [snowfall])
  const scene = useMemo(
    () => (snowfall ? tracksSnowfallTimeline({ w: 120, h: 120, short: level === 'short' }) : null),
    // One snowfall per opening; the level is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snowfall],
  )
  const dirName = (d: TracksPrint) => t(`ui.tracks.dir.${d}`)
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        ref={grid}
        role="group"
        aria-label={t('ui.tracks.title')}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        data-glade={size}
      >
        {bushes.map((b, i) => {
          // The bush just opened shows as it was opened (the save may hold the fresh glade already, after the last tap).
          const shown =
            reveal?.index === i && (!snowfall || !covered) ? { held: reveal.held, print: reveal.print } : b
          const open = !!shown.held
          const row = Math.floor(i / size) + 1
          const col = (i % size) + 1
          const parts = [
            t('ui.tracks.bushLabel', { row, col }),
            ...(shown.held ? [t(`ui.tracks.held.${shown.held}`, { name })] : []),
            ...(shown.print ? [t('ui.tracks.prints', { dir: dirName(shown.print) })] : []),
          ]
          const rustle = reveal?.index === i && !calm && level !== 'off'
          return (
            <button
              key={i}
              type="button"
              disabled={disabled || open}
              onClick={() => onTap?.(i)}
              aria-label={parts.join(', ')}
              data-bush={i}
              data-held={shown.held ?? undefined}
              className={cx(
                'ts-bush relative grid aspect-square min-h-[44px] min-w-[44px] place-items-center overflow-hidden',
                open ? 'ts-bush-open' : 'ts-bush-closed',
                rustle && 'ts-rustle',
              )}
            >
              <BushArt
                open={open}
                r={7}
                px={Math.max(1, Math.floor(cell / 25))}
                className="absolute bottom-[8%] left-1/2 -translate-x-1/2"
              />
              {open && shown.held && (
                <span className="relative z-[1] grid place-items-center">
                  <Held held={shown.held} shiny={shiny} cell={cell} />
                </span>
              )}
              {open && shown.print && (
                <Hoofprints
                  dir={shown.print}
                  size={Math.max(14, Math.round(cell * 0.3))}
                  className="absolute right-[6%] top-[6%] z-[2]"
                />
              )}
            </button>
          )
        })}
      </div>
      {/* Motion off, the snowfall lands on its end at once, its cues fired: the fresh glade, nothing to wait for. */}
      {scene && !settled ? (
        <StageCanvas
          timeline={scene}
          size={{ w: 120, h: 120 }}
          hud={{ beat: (b) => b === 'covered' && setCovered(true) }}
          onEnd={() => {
            setCovered(true)
            setSettled(true)
            onSnowed?.()
          }}
          label={t('ui.tracks.snowLabel')}
          className="pointer-events-none absolute inset-0 z-[3] h-full w-full"
        />
      ) : null}
    </div>
  )
}

/**
 * The glade's panel on the area's page: the round and its gauge's line, the taps left before the snow (snowflakes),
 * the glade, and the line under it (tap a bush; the snow fell; Stantler bolted; Stantler found).
 */
export function TracksPanel({
  round,
  total,
  last,
  taps,
  maxTaps,
  name,
  note,
  children,
}: {
  /** The round under way, 0-based. */
  round: number
  total: number
  last: boolean
  taps: number
  maxTaps: number
  name: string
  note?: ReactNode
  children: ReactNode
}) {
  const { t } = useT()
  return (
    <section className="pixel-panel ts-panel flex flex-col gap-3 p-3" aria-labelledby="ts-round" data-tracks>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ts-round" className="m-0 text-[28px] font-normal leading-none">
          {t('ui.tracks.roundTitle', { n: round + 1, total })}
        </h2>
        <span
          className="flex items-center gap-1"
          role="img"
          aria-label={t('ui.tracks.tapsLeft', { n: taps })}
          data-taps={taps}
        >
          {Array.from({ length: maxTaps }, (_, i) => (
            <SnowChip key={i} size={12} spent={i >= taps} />
          ))}
        </span>
      </div>
      {last && (
        <p className="m-0 flex items-center gap-2 font-pixel-sm text-[16px] leading-tight">
          <PixelIcon name="sparkle" size={16} />
          {t('ui.tracks.lastGlade', { name })}
        </p>
      )}
      {children}
      <p className="m-0 min-h-[1.5em] font-pixel-sm text-[16px] leading-tight text-muted" aria-live="polite">
        {note ?? t('ui.tracks.hint')}
      </p>
    </section>
  )
}

// ------------------------------------------------------------------ the outro

/**
 * The shiny Stantler caught, full screen (tracksOutroTimeline): it stands in the glade, the bushes settle, fresh snow
 * covers the prints, the card; then "The glade is quiet again", the line, and BACK TO THE WORLD. No skip; motion off,
 * all at once.
 */
export function TracksOutroView({ name, onDone }: { name: string; onDone: () => void }) {
  const { t } = useT()
  const { level } = useMotion()
  const size = useFullStage(260)
  const [card, setCard] = useState(level === 'off')
  useHoldFullscreen()
  const scene = useMemo(
    () => ({
      ready: loadSprite(STANTLER, false, true),
      timeline: tracksOutroTimeline({
        ...size,
        mon: spriteKey(STANTLER, false, true),
        title: name,
        short: level === 'short',
      }),
    }),
    // One scene per outro; the level is read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return (
    <div
      className="ts-intro fixed inset-0 z-[95] overflow-hidden bg-[#050a1a]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-outro"
    >
      <StageCanvas
        timeline={scene.timeline}
        ready={scene.ready}
        size={{ w: size.w, h: size.h }}
        hud={{
          beat: (b) => {
            if (b === 'card') {
              setCard(true)
              playCry(STANTLER)
            }
          },
        }}
        onEnd={() => setCard(true)}
        label={t('ui.tracks.outroLabel')}
        className="absolute inset-0 h-full w-full"
      />
      <div
        className={cx(
          'absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-6',
          !card && 'invisible',
        )}
      >
        <div className={cx(LINE_CARD, 'grid gap-2')}>
          <h2 id="ts-outro" className="m-0 text-[30px] font-normal leading-none text-[#c8f4ff]">
            {t('ui.tracks.outroTitle')}
          </h2>
          <p className="m-0 text-[20px] leading-tight" aria-live="polite">
            {t('ui.tracks.outroBody', { name })}
          </p>
        </div>
        <PixelButton
          variant="success"
          size="lg"
          className="w-full max-w-sm"
          onClick={onDone}
          autoFocus={card}
        >
          {t('ui.portal.victoryOk')}
        </PixelButton>
      </div>
    </div>
  )
}

/** When the snowfall over the glade has covered it, in ms (tests and the screen wait on it). */
export const snowCoverMs = (short = false) => Math.round(snowfallCoverAt(short) * 1000)
