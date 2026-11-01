// An item's description as the player reads it now. The Friend Ball's (docs/60) says the boost it gives today:
// "…current: ×{x}", filled from the player's best friendship streak (the engine's friendBallBoost).
import { bestLiveStreak, friendBallBoost, utcDay } from '@/engine'
import { useFriendship } from '@/store/friendship'
import { useGame } from '@/store/game'

/** The Friend Ball's boost for this player now: ×1 signed out, switched off, or with no streak alive. */
export function useFriendBallBoost(): number {
  const data = useGame((s) => s.data)
  const status = useFriendship((s) => s.status)
  return friendBallBoost(bestLiveStreak(status?.streaks, status?.day || utcDay(Date.now())), data)
}

/** A description with its `{x}` filled (only the Friend Ball has one). */
export function useItemDescription(text: string | null | undefined): string | null | undefined {
  const boost = useFriendBallBoost()
  return text?.includes('{x}') ? text.replaceAll('{x}', String(boost)) : text
}
