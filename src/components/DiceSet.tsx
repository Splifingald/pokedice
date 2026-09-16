import type { DieType } from '@/engine/types'
import { cx, typeColor } from '@/theme/util'

/**
 * A Pokémon's dice set at a glance: one type-coloured pip per die, typed dice first. No text inside the pips —
 * a 3-letter label can't be read at this size; the name is on the group (screen readers) and each pip (hover).
 */
export function DiceSet({ dice, size = 16, className }: { dice: DieType[]; size?: number; className?: string }) {
  const px = Math.max(12, Math.min(22, Math.round(size * 0.7)))
  return (
    <div className={cx('flex flex-wrap items-center gap-1', className)} role="img" aria-label={`Dice: ${dice.join(', ')}`}>
      {dice.map((t, i) => (
        <span
          key={i}
          title={`${t} die`}
          className="relative inline-block border-2 border-ink"
          style={{
            width: px,
            height: px,
            background: typeColor(t),
            borderRadius: 2,
            boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.22)',
          }}
        >
          {t === 'base' && (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-shadow" style={{ width: 3, height: 3 }} />
          )}
        </span>
      ))}
    </div>
  )
}
