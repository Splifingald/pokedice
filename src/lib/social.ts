import {
  inviteGauge,
  invitesWait,
  inWorldRegion,
  isExtreme,
  tradesOf,
  tradesOn,
  tradesToWatch,
} from '@/engine'
import { useFriends } from '@/lib/friends'
import { useAreaVersus } from '@/store/areaVersus'
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
  // Friend requests to answer (docs/54) are new on the Friends page too.
  const requests = useAreaVersus((s) => s.requests.length)
  const newFriends = useFriends((s) => (s.userId && s.userId === userId ? s.unseen.length : 0)) + requests
  // Invite rewards ready to open (docs/15 §25) wait on the Friends page: its dot counts them too. The gauge is read
  // here from the engine, not through InviteRewards' hook, so the shell doesn't pull the gifts' art into every page
  // (and into the unit tests' node, where it has no canvas).
  const gaugeHere = useGame(
    (s) =>
      isSupabaseConfigured &&
      s.auth.status === 'signed_in' &&
      !!s.save &&
      invitesWait(s.save, s.data) === null,
  )
  const invites = useFriends((s) => (s.userId && s.userId === userId ? s.invites : null))
  const rewardsReady = gaugeHere && invites ? inviteGauge(invites, data).ready.length : 0
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
