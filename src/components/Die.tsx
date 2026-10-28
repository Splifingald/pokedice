import { useContext, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { gameFeelOn } from '@/engine'
import type { DieType, Face } from '@/engine/types'
import { numberPx, pipLayout, PIPS } from '@/fx/dice/pips'
import { MotionCap } from '@/lib/motion'
import { usePace } from '@/lib/pace'
import { useGame } from '@/store/game'
import { PALETTE, STATUS_COLORS } from '@/theme/colors'
import { cx, hexToRgb, typeColor } from '@/theme/util'
import { PixelIcon, STATUS_ICON } from './icons'
import { useDieThrow } from './useDieThrow'
import { t } from '@/i18n'
import { statusName, typeName } from '@/lib/format'

// The pips live with the thrown cube's face art (fx/dice/pips.ts), so both draw the same face.
export { pipLayout }

/** Under this size a die drops its 3D lip for a thinner one. */
const MINI = 40

/** Ink pips on light dice, white on dark ones (perceived brightness, as the lab draws them). */
const pipColor = (fill: string) => {
  const [r, g, b] = hexToRgb(fill)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? PALETTE.ink : '#ffffff'
}

/** steps(2, start): half way at once, all the way at the end. */
const twoSteps = (t: number) => (t <= 0 ? 0 : t < 0.5 ? 0.5 : 1)

const statusColor = (face: Face | null | undefined): string | null =>
  face?.kind === 'status' ? (STATUS_COLORS[face.status as keyof typeof STATUS_COLORS] ?? PALETTE.gold) : null

function FaceArt({ face, size, ink }: { face: Face; size: number; ink: string }) {
  const lit = PIPS[face.value]
  if (!lit) {
    // A value with no pip layout: its number, centred on the face like the pips are.
    return (
      <span
        className="absolute inset-0 flex items-center justify-center font-pixel leading-none"
        style={{ fontSize: numberPx(size), color: ink }}
      >
        {face.value}
      </span>
    )
  }
  const { pip, at } = pipLayout(size)
  return (
    <>
      {lit.map((cell) => (
        <i
          key={cell}
          className="absolute block"
          style={{ left: at[cell % 3], top: at[Math.floor(cell / 3)], width: pip, height: pip, background: ink }}
        />
      ))}
    </>
  )
}

/** Ink and gold as the dice draw them: art, the same in both themes. */
const INK = PALETTE.ink
const GOLD = PALETTE.gold

/**
 * A combo die's gold corner brackets (A7a, docs/38): its corners as well as its ring say so, for players who can't tell
 * the gold ring from a pick's red one. Drawn over the face's corners, clear of the pips, so a tray never gets wider.
 */
function Brackets({ size }: { size: number }) {
  const arm = Math.max(8, Math.round((size * 0.32) / 2) * 2)
  // Gold over the corner, an ink line inside it so it reads on a gold or yellow die too.
  const corner = (at: CSSProperties, x: 1 | -1, y: 1 | -1) => (
    <i
      className="absolute block"
      style={{
        ...at,
        width: arm,
        height: arm,
        borderStyle: 'solid',
        borderColor: GOLD,
        borderWidth: `${y > 0 ? 4 : 0}px ${x < 0 ? 4 : 0}px ${y < 0 ? 4 : 0}px ${x > 0 ? 4 : 0}px`,
        boxShadow: `inset ${2 * x}px ${2 * y}px 0 0 ${INK}`,
      }}
    />
  )
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {corner({ left: 0, top: 0 }, 1, 1)}
      {corner({ right: 0, top: 0 }, -1, 1)}
      {corner({ left: 0, bottom: 0 }, 1, -1)}
      {corner({ right: 0, bottom: 0 }, -1, -1)}
    </span>
  )
}

/** A picked die's ↻ tag (A7a): it will be thrown again, said by a shape as well as the red ring. */
function RerollTag({ size }: { size: number }) {
  const tag = Math.max(16, Math.round((size * 0.34) / 2) * 2)
  return (
    <span
      className="pixel-corners absolute flex items-center justify-center"
      style={{
        left: -tag / 3,
        top: -tag / 3,
        width: tag,
        height: tag,
        background: '#ffffff',
        boxShadow: `inset 0 0 0 2px ${INK}`,
      }}
      aria-hidden
    >
      <PixelIcon name="reroll" size={tag - 4} />
    </span>
  )
}

export interface DieProps {
  type: DieType
  face?: Face | null
  size?: number
  /** Picked to be thrown again: lifted, with a red outline and a ↻ tag. */
  selected?: boolean
  /** One of the dice that make the combo: a gold ring and gold corner brackets. */
  combo?: boolean
  /** With the game feel on (docs/38 F2b): how big the combo is (1–4), each tier its own ring. */
  tier?: 0 | 1 | 2 | 3 | 4
  /** The last die of a throw to land (F8b): a two-frame squash. */
  squash?: boolean
  /** A picked die before the last reroll (F9a): a 1 px jitter. */
  jitter?: boolean
  /** Called once the die is down: its tumble or its throw over (at once with nothing to play). */
  onLand?: () => void
  locked?: boolean
  /** Change this to replay the tumble-and-settle animation. */
  rollKey?: string | number
  delay?: number
  color?: string
  onClick?: () => void
  /**
   * Keep the die a <button> even while it can't be pressed (battle tray), so the element doesn't remount and
   * replay its tumble when it becomes tappable. Without it, a die with no onClick is a plain image.
   */
  asButton?: boolean
  label?: string
  className?: string
}

/** A die in its type colour: sharp corners, an ink edge, pips on whole pixels. */
export function Die({
  type,
  face,
  size = 56,
  selected,
  combo,
  tier = 0,
  squash,
  jitter,
  onLand,
  locked,
  rollKey,
  delay = 0,
  color,
  onClick,
  asButton,
  label,
  className,
}: DieProps) {
  const fill = typeColor(type, color)
  const pace = usePace()
  const feel = useGame((s) => gameFeelOn(s.data))
  // Nothing animates (the admin's switch, or a screen capped at off): down at once. Read cheaply: dice come by the dozen.
  const stillAll = useGame((s) => s.settings.reducedMotion)
  const cap = useContext(MotionCap)
  const off = stillAll || cap === 'off'
  const ink = pipColor(fill)
  const interactive = !!onClick && !locked
  const special = statusColor(face)
  const name =
    label ??
    (face
      ? t('ui.die.withFace', {
          type: typeName(type),
          face:
            face.kind === 'status'
              ? t('ui.die.statusFace', { status: statusName(face.status), value: face.value })
              : face.value,
        })
      : t('ui.die.name', { type: typeName(type) }))
  const tag = Math.max(14, Math.round(size * 0.3))
  // With the recorded throws on (docs/37), the face hides while a canvas throws the die onto it.
  const bodyRef = useRef<HTMLSpanElement>(null)
  const { active: thrown, flying } = useDieThrow({
    rollKey,
    body: bodyRef,
    type,
    face,
    size,
    fill,
    pip: ink,
    locked: !!locked,
    delay,
    onLand,
  })
  // The tumble (no throw): down once its 0.6 s are over, or at once when nothing animates.
  const landRef = useRef(onLand)
  landRef.current = onLand
  const [downKey, setDownKey] = useState<string | number>()
  useEffect(() => {
    if (rollKey === undefined || thrown) return
    const timer = setTimeout(
      () => {
        setDownKey(rollKey)
        landRef.current?.()
      },
      off ? 0 : (delay + 0.6 * pace) * 1000,
    )
    return () => clearTimeout(timer)
    // Once per throw, as the tumble itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, thrown])
  const down = rollKey === undefined || thrown || downKey === rollKey
  const ring = combo && !selected
  const body = (
    <span
      ref={bodyRef}
      className={cx(size < MINI ? 'die-mini' : 'die', 'relative block', squash && 'die-squash', jitter && 'die-jitter')}
      style={{ width: size, height: size, ['--c' as string]: fill, opacity: locked ? 0.8 : 1 }}
    >
      {face ? (
        <FaceArt face={face} size={size} ink={ink} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-pixel leading-none" style={{ fontSize: size * 0.5, color: ink }} aria-hidden>
          ?
        </span>
      )}
      {ring && size >= 32 && <Brackets size={size} />}
      {selected && <RerollTag size={size} />}
      {special && face?.kind === 'status' && size >= 24 && (
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{ right: -tag / 3, top: -tag / 3, width: tag, height: tag, background: special, boxShadow: `inset 0 0 0 2px ${PALETTE.ink}` }}
          aria-hidden
        >
          <PixelIcon name={STATUS_ICON[face.status] ?? 'star'} size={Math.round(tag * 0.7)} />
        </span>
      )}
    </span>
  )
  const wrap = cx('die-wrap', special && 'st', ring && 'combo', ring && tier > 1 && `t${tier}`, selected && 'sel')
  const motionProps = {
    className: cx(wrap, 'relative select-none', interactive && 'cursor-pointer', className),
    // Flat, never preserve-3d: the tumble never needed it (the old drop-shadow filters flattened it all along), and
    // live it left phones not drawing a die whose throw had just landed until it was tapped (Discord, 2026-10-25).
    style: { ['--stc' as string]: special ?? undefined },
    initial:
      rollKey !== undefined && !thrown ? { rotateX: 540, rotateZ: 200, y: -size * 1.2, scale: 0.6, opacity: 0 } : (false as const),
    // A thrown die lands flat; a pick or a combo lifts it once it's down.
    animate: { rotateX: 0, rotateZ: 0, y: flying ? 0 : selected ? -6 : combo ? -5 : 0, scale: 1, opacity: 1 },
    transition: {
      default: { duration: 0.6 * pace, delay, ease: [0.2, 0.9, 0.3, 1.2] },
      // With the game feel on (F7b), a pick lifts in two steps over 60 ms, like a button press; else a 120 ms glide
      // (the tumble's own drop too, untouched).
      y: feel && down ? { duration: 0.06 * pace, ease: twoSteps } : { duration: 0.12 * pace, ease: 'linear' },
      // The press under a finger too, once the die is down (else it rides the tumble's 0.6 s).
      ...(feel && down && { scale: { duration: 0.06 * pace, ease: twoSteps } }),
    },
  }

  if (!(asButton ?? !!onClick)) {
    // A die you can't press is an image, not a disabled button.
    return (
      <motion.span key={rollKey} role="img" aria-label={name} {...motionProps}>
        {body}
      </motion.span>
    )
  }
  return (
    <motion.button
      key={rollKey}
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-pressed={interactive ? !!selected : undefined}
      aria-label={name}
      whileTap={interactive ? { scale: 0.92 } : undefined}
      {...motionProps}
    >
      {body}
    </motion.button>
  )
}

/** Six faces laid out flat, each a real die — used in the starter picker, dex sheets and the admin dice editor. */
export function DieFaces({ type, faces, size = 28, color }: { type: DieType; faces: Face[]; size?: number; color?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {faces.map((f, i) => (
        <Die key={i} type={type} face={f} size={size} color={color} />
      ))}
    </div>
  )
}
