import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

/** A labelled on/off switch. The whole row is the label, so the tap target is the full width. */
export function Toggle({
  label,
  on,
  onChange,
  hint,
  className,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  hint?: string
  className?: string
}) {
  const { t } = useT()
  return (
    <label className={cx('flex cursor-pointer items-center justify-between gap-3 py-1', className)}>
      <span>
        <span className="text-2xl">{label}</span>
        {hint && <span className="copy block text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`pixel-btn min-h-[44px] min-w-[72px] px-2 py-1 text-xl ${on ? 'bg-hp-green' : 'bg-parchment'}`}
      >
        {t(on ? 'ui.common.on' : 'ui.common.off')}
      </button>
    </label>
  )
}
