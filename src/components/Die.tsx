import { motion } from 'framer-motion'
import type { DieType, Face } from '@/engine/types'
import { usePace } from '@/lib/pace'
import { PALETTE, STATUS_COLORS } from '@/theme/colors'
import { cx, hexToRgb, typeColor } from '@/theme/util'
import { PixelIcon, STATUS_ICON } from './icons'
import { t } from '@/i18n'
import { statusName, typeName } from '@/lib/format'

/** Which of the nine pip cells (0–8, row by row) each value lights. 0 is a blank face; some typed dice reach 7 and 8. */
const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
}

/** Under this size a die drops its 3D lip for a thinner one. */
const MINI = 40

/**
 * Pip geometry on whole pixels: one even pip size per die and three fixed columns and rows, so every dot on a die is
 * the same size whatever the die's size (a fractional pip renders as a blur or a lopsided dot).
 */
export function pipLayout(size: number) {
  const pip = Math.max(2, Math.round((size * 0.15) / 2) * 2)
  const margin = Math.round(size * 0.2)
  const at = [margin, Math.round((size - pip) / 2), size - margin - pip]
  return { pip, at }
}

/** Ink pips on light dice, white on dark ones (perceived brightness, as the lab draws them). */
const pipColor = (fill: string) => {
  const [r, g, b] = hexToRgb(fill)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? PALETTE.ink : '#ffffff'
}

const statusColor = (face: Face | null | undefined): string | null =>
  face?.kind === 'status' ? (STATUS_COLORS[face.status as keyof typeof STATUS_COLORS] ?? PALETTE.gold) : null

function FaceArt({ face, size, ink }: { face: Face; size: number; ink: string }) {
  const lit = PIPS[face.value]
  if (!lit) {
    // A value with no pip layout: its number.
    return (
      <span className="font-pixel leading-none" style={{ fontSize: Math.round(size * 0.62), color: ink }}>
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

export interface DieProps {
  type: DieType
  face?: Face | null
  size?: number
  /** Picked to be thrown again: lifted, with a red outline. */
  selected?: boolean
  /** One of the dice that make the combo: a gold ring. */
  combo?: boolean
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
export function Die({ type, face, size = 56, selected, combo, locked, rollKey, delay = 0, color, onClick, asButton, label, className }: DieProps) {
  const fill = typeColor(type, color)
  const pace = usePace()
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
  const body = (
    <span
      className={cx(size < MINI ? 'die-mini' : 'die', 'relative block')}
      style={{ width: size, height: size, ['--c' as string]: fill, opacity: locked ? 0.8 : 1 }}
    >
      {face ? (
        <FaceArt face={face} size={size} ink={ink} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-pixel leading-none text-muted" style={{ fontSize: size * 0.5 }} aria-hidden>
          ?
        </span>
      )}
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
  const wrap = cx('die-wrap', special && 'st', combo && !selected && 'combo', selected && 'sel')
  const motionProps = {
    className: cx(wrap, 'relative select-none', interactive && 'cursor-pointer', className),
    style: { ['--stc' as string]: special ?? undefined, transformStyle: 'preserve-3d' as const },
    initial: rollKey !== undefined ? { rotateX: 540, rotateZ: 200, y: -size * 1.2, scale: 0.6, opacity: 0 } : (false as const),
    animate: { rotateX: 0, rotateZ: 0, y: selected ? -6 : combo ? -5 : 0, scale: 1, opacity: 1 },
    transition: {
      default: { duration: 0.6 * pace, delay, ease: [0.2, 0.9, 0.3, 1.2] },
      y: { duration: 0.12 * pace, ease: 'linear' },
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
