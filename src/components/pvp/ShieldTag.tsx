// The Bonus Shield's tag (Friend Battles' draft, docs/65; docs/15 §50): INFO's sky blue on the plate of the first
// picker's Pokémon, struck out once the first attack on that side has been halved.
import { useT } from '@/i18n/react'
import { cx } from '@/theme/util'

export function ShieldTag({ used = false, className }: { used?: boolean; className?: string }) {
  const { t } = useT()
  return (
    <span
      className={cx(
        'light-scope pixel-corners inline-flex shrink-0 items-center gap-1 px-1.5 py-px font-pixel-sm text-[14px] uppercase leading-none tracking-[0.04em]',
        used ? 'bg-shadow text-ink line-through' : 'bg-[#2f6bc4] text-white',
        className,
      )}
      title={t(used ? 'ui.pvp.shieldUsed' : 'ui.pvp.shieldHint')}
      aria-label={t(used ? 'ui.pvp.shieldUsed' : 'ui.pvp.shieldHint')}
    >
      <svg width="10" height="12" viewBox="0 0 5 6" aria-hidden className="shrink-0">
        <path d="M2.5 0 5 1v2c0 1.4-1.2 2.5-2.5 3C1.2 5.5 0 4.4 0 3V1z" fill="currentColor" />
      </svg>
      {t('ui.pvp.shield')}
    </span>
  )
}
