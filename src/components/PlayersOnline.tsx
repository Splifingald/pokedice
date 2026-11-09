// Players online (docs/70): a line at the foot of the side menu, above SYNC ONLINE. The count is the server's
// (store/online.ts); the line is hidden until it has one, and wherever the switch is closed to the player.
import { useEffect } from 'react'
import { playersOnlineOn } from '@/engine'
import { tPlural } from '@/i18n'
import { useT } from '@/i18n/react'
import { useGame } from '@/store/game'
import { ONLINE_MENU_MS, pingOnline, useOnlineCount } from '@/store/online'

/** The line itself: a green dot (as a friend online, docs/65) and "12 players online". */
export function PlayersOnlineView({ count }: { count: number }) {
  useT()
  return (
    <p className="flex items-center gap-1.5 px-1 font-pixel-sm text-[16px] leading-tight text-good">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3fbf6a] shadow-ring-thin" />
      {tPlural('ui.menu.playersOnline', count)}
    </p>
  )
}

/** In the menu: asks again on opening when the last count is over a minute old. */
export function PlayersOnline() {
  const on = useGame((s) => playersOnlineOn(s.data))
  const count = useOnlineCount((s) => s.count)
  useEffect(() => {
    if (on) void pingOnline(ONLINE_MENU_MS)
  }, [on])
  return on && count != null ? <PlayersOnlineView count={count} /> : null
}
