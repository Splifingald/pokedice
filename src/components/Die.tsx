import { motion } from 'framer-motion'
import type { DieType, Face } from '@/engine/types'
import { usePace } from '@/lib/pace'
import { PALETTE, STATUS_COLORS } from '@/theme/colors'
import { cx, shade, textOn, typeColor } from '@/theme/util'
import { PixelIcon, STATUS_GLYPH } from './icons'
import { t } from '@/i18n'
import { statusName, typeName } from '@/lib/format'

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
}

/** Under this size a die is "mini" (faces laid out flat): digits instead of pips, which can't be read that small. */
const MINI = 40

/** A status face's colour, or null for a plain number. */
const statusColor = (face: Face | null | undefined): string | null =>
  face?.kind === 'status' ? (STATUS_COLORS[face.status as keyof typeof STATUS_COLORS] ?? PALETTE.gold) : null

/** A status face is drawn like any other (its number) — the die's coloured outline and corner tag say it's special. */
function FaceArt({ face, size, color, ink }: { face: Face; size: number; color: string; ink: string }) {
  const mini = size < MINI
  const pips = mini ? undefined : PIPS[face.value]
  if (!pips) {
    return (
      <span
        className={cx('leading-none', mini ? 'font-pixel-sm' : 'font-pixel')}
        style={{ fontSize: mini ? Math.round(size * 0.8) : size * 0.62, color: ink }}
      >
        {face.value}
      </span>
    )
  }
  const pip = Math.max(4, Math.round(size * 0.16))
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3" style={{ padding: size * 0.14 }}>
      {Array.from({ length: 9 }, (_, i) => {
        const x = i % 3
        const y = Math.floor(i / 3)
        const on = pips.some(([px, py]) => px === x && py === y)
        return (
          <div key={i} className="flex items-center justify-center">
            {on && <span style={{ width: pip, height: pip, background: ink, boxShadow: `1px 1px 0 ${color}` }} />}
          </div>
        )
      })}
    </div>
  )
}

export interface DieProps {
  type: DieType
  face?: Face | null
  size?: number
  selected?: boolean
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

/** A die in its type skin. Base dice: off-white with grey pips. Normal: warm tan. */
export function Die({ type, face, size = 56, selected, locked, rollKey, delay = 0, color, onClick, asButton, label, className }: DieProps) {
  const bg = typeColor(type, color)
  const mini = size < MINI
  const pace = usePace()
  // Base dice have grey pips; a mini digit needs full ink to be read.
  const ink = type === 'base' && !mini ? PALETTE.muted : type === 'base' ? PALETTE.ink : textOn(bg)
  const interactive = !!onClick && !locked
  const special = statusColor(face)
  const ring = mini ? 2 : 3
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
  const base = {
    className: cx(mini ? 'die-mini' : 'die', 'relative flex select-none items-center justify-center', interactive && 'cursor-pointer', className),
    style: {
      width: size,
      height: size,
      background: `linear-gradient(135deg, ${shade(bg, 1.08)} 0%, ${bg} 55%, ${shade(bg, 0.88)} 100%)`,
      outline: selected ? '3px dashed #e8b44a' : undefined,
      outlineOffset: special ? ring + 5 : 3,
      // A status face: a ring in its colour, edged in ink, round the die (in place of the drop shadow).
      boxShadow: special
        ? `inset 0 -4px 0 0 rgba(0, 0, 0, 0.2), inset 0 3px 0 0 rgba(255, 255, 255, 0.35), 0 0 0 ${ring}px ${special}, 0 0 0 ${ring + 2}px ${PALETTE.ink}`
        : undefined,
      opacity: locked ? 0.55 : 1,
      transformStyle: 'preserve-3d' as const,
    },
    initial: rollKey !== undefined ? { rotateX: 540, rotateZ: 200, y: -size * 1.2, scale: 0.6, opacity: 0 } : (false as const),
    animate: { rotateX: 0, rotateZ: 0, y: selected ? -8 : 0, scale: 1, opacity: locked ? 0.55 : 1 },
    transition: {
      default: { duration: 0.6 * pace, delay, ease: [0.2, 0.9, 0.3, 1.2] },
      y: { duration: 0.12 * pace },
    },
  }
  const content = face ? (
    <>
      <FaceArt face={face} size={size} color={bg} ink={ink} />
      {special && face.kind === 'status' && size >= MINI && (
        <span
          className="absolute flex items-center justify-center border-2 border-ink"
          style={{ top: -ring - 6, right: -ring - 6, width: size * 0.36, height: size * 0.36, background: special, borderRadius: 2 }}
          aria-hidden
        >
          <PixelIcon name={STATUS_GLYPH[face.status] ?? 'star'} size={size * 0.24} color={PALETTE.ink} />
        </span>
      )}
    </>
  ) : (
    <span className="font-pixel text-muted" style={{ fontSize: size * 0.5 }} aria-hidden>
      ?
    </span>
  )

  if (!(asButton ?? !!onClick)) {
    // A die you can't press is an image, not a disabled button.
    return (
      <motion.span key={rollKey} role="img" aria-label={name} {...base}>
        {content}
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
      {...base}
    >
      {content}
    </motion.button>
  )
}

/** Six faces laid out flat — used in the starter picker, dex sheets and the admin dice editor. */
export function DieFaces({ type, faces, size = 28, color }: { type: DieType; faces: Face[]; size?: number; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {faces.map((f, i) => (
        <Die key={i} type={type} face={f} size={size} color={color} />
      ))}
    </div>
  )
}
