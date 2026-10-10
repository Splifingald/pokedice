// /f/<code>: an invite link. Keeps the code (src/lib/friendInvite) and goes on — to the Friends page when there is a
// game, to the title screen otherwise. The game shell's FriendsService does the rest.
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { INVITE_EVENT } from '@/components/friends/FriendsService'
import { saveInvite } from '@/lib/friendInvite'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'

export function FriendInvite() {
  const { code = '' } = useParams()
  const hasSave = useGame((s) => !!s.save)
  const [kept] = useState(() => (isSupabaseConfigured ? saveInvite(code) : null))
  useEffect(() => {
    if (kept) window.dispatchEvent(new Event(INVITE_EVENT))
  }, [kept])
  return <Navigate to={kept && hasSave ? '/friends' : '/'} replace />
}
