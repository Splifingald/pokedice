import type { StatusState } from '@/engine/status'
import type { StatusKind } from '@/engine'
import { StatusChip } from './Chip'

/** A Pokémon's statuses as chips — icon, short name and counter (burn: stacks × turns) — never colour alone. */
export function StatusIcons({ status }: { status: StatusState }) {
  const items: { kind: StatusKind; text?: string }[] = []
  if (status.burn) items.push({ kind: 'burn', text: `${status.burn.stacks}×${status.burn.turns}` })
  if (status.poison) items.push({ kind: 'poison', text: `${status.poison.turns}` })
  if (status.frozen) items.push({ kind: 'frozen', text: `${status.frozen}` })
  if (status.paralyze) items.push({ kind: 'paralyze', text: `${status.paralyze}` })
  if (status.confused) items.push({ kind: 'confuse' })
  if (!items.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <StatusChip key={i.kind} status={i.kind} count={i.text} />
      ))}
    </div>
  )
}
