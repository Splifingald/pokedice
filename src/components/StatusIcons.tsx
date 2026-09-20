import type { StatusState } from '@/engine/status'
import { useT } from '@/i18n/react'
import { PixelIcon, type IconName } from './icons'

/** Status icons with their turn counters (burn shows stacks × turns). */
export function StatusIcons({ status }: { status: StatusState }) {
  const { t } = useT()
  const items: { icon: IconName; label: string; text: string }[] = []
  if (status.burn) items.push({ icon: 'burn', label: t('ui.statusIcon.burn'), text: `${status.burn.stacks}×${status.burn.turns}` })
  if (status.poison) items.push({ icon: 'poison', label: t('ui.statusIcon.poison'), text: `${status.poison.turns}` })
  if (status.frozen) items.push({ icon: 'frozen', label: t('ui.statusIcon.frozen'), text: `${status.frozen}` })
  if (status.paralyze) items.push({ icon: 'paralyze', label: t('ui.statusIcon.paralyze'), text: `${status.paralyze}` })
  if (status.confused) items.push({ icon: 'confuse', label: t('ui.statusIcon.confuse'), text: '!' })
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span
          key={i.icon}
          title={i.label}
          className="inline-flex items-center gap-0.5 border-2 border-ink bg-panel px-1 font-mono text-xs leading-none"
          style={{ borderRadius: 2 }}
        >
          <PixelIcon name={i.icon} size={12} title={i.label} />
          {i.text}
        </span>
      ))}
    </div>
  )
}
