import { confusionLevel, type StatusState } from '@/engine/status'
import type { StatusKind } from '@/engine'
import { StatusChip } from './Chip'

/** A Pokémon's statuses as chips — icon, short name and counter (burn: stacks × turns; confusion: its level) — never colour alone. */
export function StatusIcons({ status }: { status: StatusState }) {
  const items: { kind: StatusKind; text?: string }[] = []
  if (status.burn) items.push({ kind: 'burn', text: `${status.burn.stacks}×${status.burn.turns}` })
  if (status.poison) items.push({ kind: 'poison', text: `${status.poison.turns}` })
  if (status.frozen) items.push({ kind: 'frozen', text: `${status.frozen}` })
  if (status.paralyze) items.push({ kind: 'paralyze', text: `${status.paralyze}` })
  // How confused: ×2 and ×3 for a stronger confusion (a bigger recoil).
  const confused = confusionLevel(status)
  if (confused) items.push({ kind: 'confuse', text: confused > 1 ? `×${confused}` : undefined })
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <StatusChip key={i.kind} status={i.kind} count={i.text} />
      ))}
    </div>
  )
}
