// Keeps push notifications in step with the game (docs/25): a few seconds after the save, the content, the language,
// the account or the player's topics change, the schedule the server sends from is worked out again, and sent only if
// it differs from the last one. Also takes a notification's tap while the game is open, and holds the question.
import { useEffect } from 'react'
import { getLang } from '@/i18n'
import { syncPush, usePush } from '@/lib/push'
import { useGame } from '@/store/game'
import { serverNow, useServerTime } from '@/store/serverTime'
import { PushAsk, usePushLinks } from './PushPrompt'

/** A burst of saves (a fight's every turn) makes one sync, after it settles. */
const SETTLE_MS = 4000

export function PushService() {
  usePushLinks()
  const on = usePush((s) => s.on)
  const topics = usePush((s) => s.topics)
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const user = useGame((s) => s.auth.userId)
  const clock = useServerTime((s) => s.offset != null)
  const lang = getLang()
  useEffect(() => {
    if (!on) return
    const id = setTimeout(() => {
      const s = useGame.getState()
      void syncPush(s.save, s.data, serverNow())
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [on, topics, save, data, user, clock, lang])
  return <PushAsk />
}
