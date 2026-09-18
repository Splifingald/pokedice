// How far each player got, all time: their highest Pokémon level and the furthest (non-hidden) area they reached.
// Read from level_up and area_unlocked events plus their game snapshots, so it doesn't depend on the time frame.
import type { GameData } from '@/engine/types'
import type { PlayerSnapshot } from './events'

export interface ProgressEvent {
  player: string
  kind: string
  params: Record<string, unknown> | null
}

export interface PlayerProgress {
  topLevel: number
  /** Position of the furthest area in the campaign (orderIndex order), -1 = none known. */
  areaRank: number
  areaName: string
}

export function playerProgress(events: ProgressEvent[], data: GameData): Map<string, PlayerProgress> {
  const main = data.areas.filter((a) => !a.hidden)
  const rank = new Map(main.map((a, i) => [a.id, i]))
  const out = new Map<string, PlayerProgress>()
  for (const e of events) {
    const p = out.get(e.player) ?? { topLevel: 0, areaRank: -1, areaName: '' }
    const reach = (areaId: unknown) => {
      const r = rank.get(String(areaId))
      if (r != null && r > p.areaRank) {
        p.areaRank = r
        p.areaName = main[r]!.name
      }
    }
    if (e.kind === 'level_up') p.topLevel = Math.max(p.topLevel, Number(e.params?.to) || 0)
    else if (e.kind === 'area_unlocked') reach(e.params?.areaId)
    else if (e.kind === 'snapshot' && e.params) {
      const s = e.params as unknown as PlayerSnapshot
      for (const m of [...(s.team ?? []), ...(s.dayCare ?? [])]) p.topLevel = Math.max(p.topLevel, m.level)
      reach(s.areaId)
    }
    out.set(e.player, p)
  }
  return out
}
