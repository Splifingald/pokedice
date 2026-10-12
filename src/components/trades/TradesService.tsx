// Trades' background work (docs/23 §1.6), mounted with the game shell: the check once the sign-in's sync has settled
// (and again when the save switches back from Extreme mode), and on return to the tab (at most every 5 minutes).
import { useEffect } from 'react'
import { useGame } from '@/store/game'
import { useCloudSync } from '@/store/sync'
import { checkTrades } from '@/store/trades'

export function TradesService() {
  const userId = useGame((s) => (s.auth.status === 'signed_in' ? s.auth.userId : null))
  const mode = useGame((s) => s.save?.mode ?? null)
  // Null until the sign-in's sync has settled (and after signing out).
  const synced = useCloudSync((s) => s.lastAt != null)

  useEffect(() => {
    if (userId && synced) void checkTrades(true)
  }, [userId, synced, mode])

  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && void checkTrades()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [])

  return null
}
