// A die's six faces as real dice, and what its status faces do, with the game's own numbers (config.status).
import type { DieType, Face, StatusKind } from '@/engine'
import { useT } from '@/i18n/react'
import { statusEffects, statusName, typeName } from '@/lib/format'
import { useGame } from '@/store/game'
import { STATUS_COLORS } from '@/theme/colors'
import { badgeColors } from '@/theme/util'
import { Die } from './Die'
import { PixelIcon, STATUS_ICON } from './icons'

/** The statuses a set of faces can cause, in face order. */
export const facesStatuses = (faces: readonly Face[]): StatusKind[] => [
  ...new Set(faces.flatMap((f) => (f.kind === 'status' ? [f.status] : []))),
]

/**
 * Six dice in a row, each with its value underneath; a status face wears its colour ring and badge (drawn by `Die`)
 * and its name in a chip, so the status never rests on colour alone.
 */
export function FaceDice({
  type,
  faces,
  size = 40,
}: {
  type: DieType
  faces: readonly Face[]
  size?: number
}) {
  const { t } = useT()
  return (
    <ul
      className="grid grid-cols-6 justify-items-center gap-1.5 pt-1.5"
      aria-label={t('ui.sheet.facesOf', { die: typeName(type) })}
    >
      {faces.map((f, i) => {
        const tone = f.kind === 'status' ? badgeColors(STATUS_COLORS[f.status]) : null
        return (
          <li key={i} className="flex flex-col items-center gap-1">
            <Die type={type} face={f} size={size} />
            {tone && f.kind === 'status' ? (
              <span
                className="max-w-[56px] truncate px-1 pb-px font-pixel-sm text-[13px] leading-[1.1]"
                style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                aria-hidden
              >
                {t(`ui.status.${f.status}.short`)}
              </span>
            ) : (
              <span className="font-pixel-sm text-[13px] leading-none text-muted" aria-hidden>
                {f.value}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** One line per status the faces can cause: when it triggers and what it does, tinted in the status colour. */
export function StatusLines({ statuses }: { statuses: readonly StatusKind[] }) {
  useT()
  const rules = useGame((s) => s.data.config.status)
  if (!statuses.length) return null
  const all = statusEffects(rules)
  return (
    <ul className="flex flex-col gap-1">
      {statuses.map((s) => {
        const e = all.find((x) => x.status === s)
        if (!e) return null
        const c = STATUS_COLORS[s]
        return (
          <li
            key={s}
            className="flex items-start gap-2 px-2 pb-1.5 pt-1 font-pixel-sm text-[15px] leading-tight text-ink"
            style={{
              background: `color-mix(in oklab, ${c} 14%, rgb(var(--c-paper)))`,
              boxShadow: `inset 4px 0 0 ${c}`,
            }}
          >
            <PixelIcon name={STATUS_ICON[s] ?? 'star'} size={16} className="mt-px shrink-0" />
            <span>
              <b className="font-pixel text-[16px] font-normal">{statusName(s)}</b> {e.when}: {e.what}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
