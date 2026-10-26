import { inWorldRegion, isExtreme, tradesOf, tradesOn, tradesToWatch } from '@/engine'
import { useInviteGauge } from '@/components/friends/InviteRewards'
import { useFriends } from '@/lib/friends'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'

/**
 * What the Social tab holds for this player (docs/43 §3): which of its views exist and what's new in them. Friends need
 * the online service; Trades the admin's switch (and stay while something is listed, so it can come back), never in
 * Extreme mode or a small world (docs/21, docs/23).
 */
export function useSocial() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const userId = useGame((s) => s.auth.userId)
  const newFriends = useFriends((s) => (s.userId && s.userId === userId ? s.unseen.length : 0))
  // Invite rewards ready to open (docs/15 §25) wait on the Friends page: its dot counts them too.
  const rewardsReady = useInviteGauge()?.ready.length ?? 0
  const tradesUnseen = save && !isExtreme(save) ? tradesToWatch(save).length : 0
  const tradesOut = save ? tradesOf(save).out.length : 0
  const trades =
    isSupabaseConfigured &&
    !!save &&
    !isExtreme(save) &&
    !inWorldRegion(save, data) &&
    (tradesOn(data) || tradesOut > 0)
  return {
    friends: isSupabaseConfigured,
    trades,
    friendsNew: newFriends + rewardsReady,
    tradesNew: trades ? tradesUnseen : 0,
    news: newFriends + rewardsReady + (trades ? tradesUnseen : 0),
  }
}
