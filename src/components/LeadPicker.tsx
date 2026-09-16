import { teamOf } from '@/engine'
import { useGame } from '@/store/game'
import { MonCard } from './MonCard'

/** "Before each fight the player picks which one to send." */
export function LeadPicker({ value, onChange }: { value: string | null; onChange: (uid: string) => void }) {
  const save = useGame((s) => s.save)
  if (!save) return null
  const team = teamOf(save)
  const current = value && team.some((p) => p.id === value && p.currentHp > 0) ? value : team.find((p) => p.currentHp > 0)?.id
  return (
    <div>
      <div className="mb-1 text-lg text-muted">Send out:</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {team.map((p) => (
          <MonCard
            key={p.id}
            inst={p}
            selected={p.id === current}
            disabled={p.currentHp <= 0}
            onClick={() => onChange(p.id)}
            showDice
          />
        ))}
      </div>
    </div>
  )
}

export function defaultLead(): string | undefined {
  const save = useGame.getState().save
  return save ? teamOf(save).find((p) => p.currentHp > 0)?.id : undefined
}
